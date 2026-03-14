import { GoogleGenAI } from "@google/genai";

const tabUpload = document.getElementById('tab-upload');
const tabDashboard = document.getElementById('tab-dashboard');
const uploadSection = document.getElementById('upload-section');
const dashboardSection = document.getElementById('dashboard-section');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewImage = document.getElementById('preview-image');
const loading = document.getElementById('loading');
const resultContainer = document.getElementById('result-container');
const resultCard = document.getElementById('result-card');
const resetBtn = document.getElementById('reset-btn');
const historyTableBody = document.getElementById('history-table-body');

// Tab Switching
tabUpload.addEventListener('click', () => {
    tabUpload.classList.add('active');
    tabDashboard.classList.remove('active');
    uploadSection.classList.remove('remove');
    uploadSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
});

tabDashboard.addEventListener('click', () => {
    tabDashboard.classList.add('active');
    tabUpload.classList.remove('active');
    dashboardSection.classList.remove('hidden');
    uploadSection.classList.add('hidden');
    loadHistory();
});

// File Upload Logic
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

async function handleFile(file) {
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewImage.classList.remove('hidden');
        document.querySelector('.upload-placeholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);

    // Show loading
    loading.classList.remove('hidden');
    resultContainer.classList.add('hidden');

    try {
        // 1. Extract structured data using Gemini
        const base64Image = await fileToBase64(file);
        const extractedData = await extractTextWithGemini(base64Image);
        
        if (!extractedData || (!extractedData.full_text && !extractedData.pincode)) {
            throw new Error('Could not extract text from image');
        }

        // 2. Verify with backend (Local Database)
        const response = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(extractedData)
        });

        if (!response.ok) throw new Error('Failed to verify');

        const result = await response.json();
        displayResult(result);
    } catch (error) {
        console.error(error);
        alert('Error processing image: ' + error.message);
    } finally {
        loading.classList.add('hidden');
    }
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

async function extractTextWithGemini(base64Data) {
    const apiKey = window.ENV?.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '');
    if (!apiKey) {
        throw new Error('Gemini API Key is missing. Please check your .env file.');
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
            parts: [
                { inlineData: { data: base64Data, mimeType: "image/png" } },
                { text: `Extract the address details from this image. 
                Return ONLY a JSON object with the following fields:
                - full_text: the entire extracted text
                - pincode: 6-digit pincode (if found)
                - locality: specific area or street (if found)
                - city: main city (if found)
                - state: state name (if found)
                - ai_verified: boolean, true if the pincode matches the city/state based on your knowledge
                
                Example:
                {
                  "full_text": "123, Banjara Hills, Hyderabad, Telangana 500034",
                  "pincode": "500034",
                  "locality": "Banjara Hills",
                  "city": "Hyderabad",
                  "state": "Telangana",
                  "ai_verified": true
                }` }
            ]
        },
        config: {
            responseMimeType: "application/json"
        }
    });
    
    try {
        return JSON.parse(response.text);
    } catch (e) {
        console.error("Failed to parse Gemini response as JSON", e);
        return { full_text: response.text };
    }
}

function displayResult(result) {
    resultContainer.classList.remove('hidden');
    
    let statusClass = 'failed';
    if (result.status === 'Correct') statusClass = 'correct';
    else if (result.status.includes('Incorrect (Fetched')) statusClass = 'incorrect-fetched';
    else if (result.status.includes('Incorrect (Failed')) statusClass = 'incorrect-failed';

    resultCard.innerHTML = `
        <div class="result-item">
            <div class="result-label">Status</div>
            <div class="status-badge status-${statusClass}">${result.status}</div>
        </div>
        <div class="result-item">
            <div class="result-label">Detected Pincode</div>
            <div class="result-value">${result.pincode}</div>
        </div>
        ${result.corrected_pincode ? `
        <div class="result-item highlight">
            <div class="result-label">Corrected Pincode</div>
            <div class="result-value" style="color: var(--primary); font-size: 1.5rem; font-weight: 700;">${result.corrected_pincode}</div>
        </div>
        ` : ''}
        <div class="result-item">
            <div class="result-label">City/Locality</div>
            <div class="result-value">${result.city}</div>
        </div>
        <div class="result-item">
            <div class="result-label">State</div>
            <div class="result-value">${result.state}</div>
        </div>
        <div class="result-item">
            <div class="result-label">Extracted Text</div>
            <div class="result-value" style="font-size: 0.875rem; color: var(--text-muted); font-family: monospace; white-space: pre-wrap;">${result.original_text}</div>
        </div>
    `;
}

resetBtn.addEventListener('click', () => {
    resultContainer.classList.add('hidden');
    previewImage.classList.add('hidden');
    document.querySelector('.upload-placeholder').classList.remove('hidden');
    fileInput.value = '';
});

async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        const history = await response.json();
        
        historyTableBody.innerHTML = history.map(item => {
            let statusClass = 'failed';
            if (item.status === 'Correct') statusClass = 'correct';
            else if (item.status.includes('Incorrect (Fetched')) statusClass = 'incorrect-fetched';
            else if (item.status.includes('Incorrect (Failed')) statusClass = 'incorrect-failed';
            
            return `
                <tr>
                    <td>${new Date(item.timestamp).toLocaleString()}</td>
                    <td>${item.pincode}</td>
                    <td>${item.city}</td>
                    <td>${item.state}</td>
                    <td><span class="status-badge status-${statusClass}">${item.status}</span></td>
                    <td>${item.corrected_pincode || '-'}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to load history', error);
    }
}

