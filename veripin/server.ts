import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Serve environment variables to frontend
app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.ENV = { GEMINI_API_KEY: "${process.env.GEMINI_API_KEY || ''}" };`);
});

// SQLite setup
const dbPath = path.join(__dirname, 'database', 'veripin.db');
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath));
}
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS verification_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    original_text TEXT,
    pincode TEXT,
    city TEXT,
    state TEXT,
    is_valid INTEGER,
    corrected_pincode TEXT,
    status TEXT
  )`);
});

// Load verification data
const pincodeData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'pincodes.json'), 'utf8'));

async function fetchPincodeDetails(pincode: string) {
  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data: any = await response.json();
    if (data && data[0].Status === 'Success') {
      return data[0].PostOffice;
    }
  } catch (error) {
    console.error('External API Error:', error);
  }
  return null;
}

async function searchPincodeByLocality(locality: string) {
  try {
    const response = await fetch(`https://api.postalpincode.in/postoffice/${locality}`);
    const data: any = await response.json();
    if (data && data[0].Status === 'Success') {
      return data[0].PostOffice;
    }
  } catch (error) {
    console.error('External Search API Error:', error);
  }
  return null;
}

// Verification Endpoint (now accepts structured data)
app.post('/api/verify', async (req, res) => {
  const { full_text, pincode, locality, city, state, ai_verified } = req.body;
  const text = full_text || '';
  
  if (!text && !pincode) {
    return res.status(400).json({ error: 'No data provided' });
  }

  try {
    // Use extracted pincode or find in text
    const extractedPincode = pincode || (text.match(/\b\d{6}\b/) ? text.match(/\b\d{6}\b/)[0] : null);
    const lowerText = text.toLowerCase();
    
    let isValid = false;
    let correctedPincode = '';
    let matchedData = null;
    let status = 'Failed';
    let displayCity = city || 'Unknown';
    let displayState = state || 'Unknown';

    if (extractedPincode) {
      // 1. Try External Official API first
      const externalData = await fetchPincodeDetails(extractedPincode);
      
      let pincodeMatchesLocality = false;
      if (externalData) {
        const checkLocality = (locality || '').toLowerCase();
        const checkCity = (city || '').toLowerCase();

        for (const po of externalData) {
          const poLocality = po.Name.toLowerCase();
          const poCity = po.District.toLowerCase();

          // Strict match: The locality name from the address must be present in the official Post Office name
          const localityMatches = (checkLocality && (poLocality.includes(checkLocality) || checkLocality.includes(poLocality))) || 
                                 (lowerText.includes(poLocality));
          
          if (localityMatches) {
            pincodeMatchesLocality = true;
            displayCity = po.District;
            displayState = po.State;
            matchedData = { locality: po.Name, city: po.District, state: po.State };
            break;
          }
        }
      }

      if (pincodeMatchesLocality) {
        isValid = true;
        status = 'Correct';
      } else {
        // Pincode is incorrect for this locality. Try to find the CORRECT one.
        // SEARCH STRATEGY: External API Search is now PRIMARY
        const searchTerms = [locality, city].filter(t => t && t.length > 2);
        let foundCorrect = false;

        // Try searching by specific locality first (External API)
        for (const term of searchTerms) {
          const externalResults = await searchPincodeByLocality(term);
          if (externalResults) {
            const checkLocality = (locality || '').toLowerCase();
            for (const res of externalResults) {
              const resLocality = res.Name.toLowerCase();
              // We need a strong match for the locality
              if ((checkLocality && (resLocality.includes(checkLocality) || checkLocality.includes(resLocality))) || 
                  (lowerText.includes(resLocality))) {
                correctedPincode = res.Pincode;
                status = 'Incorrect (Fetched Correct Pincode)';
                displayCity = res.District;
                displayState = res.State;
                foundCorrect = true;
                break;
              }
            }
          }
          if (foundCorrect) break;
        }

        // Fallback to Local DB only if external search failed
        if (!foundCorrect) {
          const suggestions = pincodeData.map((d: any) => {
            let matches = 0;
            const lowerLocality = d.locality.toLowerCase();
            const checkLocality = (locality || '').toLowerCase();
            if (checkLocality && (lowerLocality.includes(checkLocality) || checkLocality.includes(lowerLocality))) matches += 3;
            else if (lowerText.includes(lowerLocality)) matches += 2;
            return { ...d, matches };
          }).filter((d: any) => d.matches >= 2)
            .sort((a: any, b: any) => b.matches - a.matches);

          if (suggestions.length > 0) {
            correctedPincode = suggestions[0].pincode;
            status = 'Incorrect (Fetched Correct Pincode)';
            displayCity = suggestions[0].city;
            displayState = suggestions[0].state;
            foundCorrect = true;
          }
        }

        if (!foundCorrect) {
          status = 'Incorrect (Failed to Fetch Correct Pincode)';
        }
      }
    } else {
      // No pincode found - Try to discover it
      const searchTerms = [locality, city].filter(t => t && t.length > 2);
      let found = false;

      // 1. External Search (Primary)
      for (const term of searchTerms) {
        const externalResults = await searchPincodeByLocality(term);
        if (externalResults) {
          const checkLocality = (locality || '').toLowerCase();
          for (const res of externalResults) {
            const resLocality = res.Name.toLowerCase();
            if ((checkLocality && (resLocality.includes(checkLocality) || checkLocality.includes(resLocality))) || 
                (lowerText.includes(resLocality))) {
              correctedPincode = res.Pincode;
              status = 'Incorrect (Fetched Correct Pincode)';
              displayCity = res.District;
              displayState = res.State;
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }

      // 2. Local DB (Fallback)
      if (!found) {
        const suggestions = pincodeData.map((d: any) => {
          let matches = 0;
          const lowerLocality = d.locality.toLowerCase();
          const checkLocality = (locality || '').toLowerCase();
          if (checkLocality && (lowerLocality.includes(checkLocality) || checkLocality.includes(lowerLocality))) matches += 3;
          else if (lowerText.includes(lowerLocality)) matches += 2;
          return { ...d, matches };
        }).filter((d: any) => d.matches >= 2)
          .sort((a: any, b: any) => b.matches - a.matches);

        if (suggestions.length > 0) {
          correctedPincode = suggestions[0].pincode;
          status = 'Incorrect (Fetched Correct Pincode)';
          displayCity = suggestions[0].city;
          displayState = suggestions[0].state;
          found = true;
        }
      }

      if (!found) {
        status = 'Failed';
      }
    }

    const result = {
      timestamp: new Date().toISOString(),
      original_text: text,
      pincode: extractedPincode || 'Not Found',
      city: displayCity,
      state: displayState,
      is_valid: isValid ? 1 : 0,
      corrected_pincode: correctedPincode,
      status: status
    };

    // Store in DB
    db.run(`INSERT INTO verification_history (timestamp, original_text, pincode, city, state, is_valid, corrected_pincode, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
            [result.timestamp, result.original_text, result.pincode, result.city, result.state, result.is_valid, result.corrected_pincode, result.status]);

    res.json(result);

  } catch (error) {
    console.error('Verification Error:', error);
    res.status(500).json({ error: 'Failed to process verification' });
  }
});

// History Endpoint
app.get('/api/history', (req, res) => {
  db.all("SELECT * FROM verification_history ORDER BY id DESC", (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
