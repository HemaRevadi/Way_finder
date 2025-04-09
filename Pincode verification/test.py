from flask import Flask, render_template, request, redirect, flash, jsonify
import os
import requests
import pytesseract
from PIL import Image
import re
import urllib.parse
import json
import pandas as pd

GOOGLE_API_KEY = 'YOUR_GOOGLE_API_KEY'
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key_here'
app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ✅ Function to extract pincode from text (from image)
def extract_pincode(text):
    match = re.search(r'\b\d{6}\b', text)  # Looks for a 6-digit number (Indian Pincode format)
    return match.group() if match else None

# ✅ Primary API (Checks if Pincode is valid)
def verify_pincode(pincode):
    api_url = f"https://api.postalpincode.in/pincode/{pincode}"
    response = requests.get(api_url)

    if response.status_code == 200:
        try:
            data = response.json()
            if data[0]['Status'] == "Success":
                return True
        except requests.exceptions.JSONDecodeError:
            return False
    return False

# Function to fetch the pincode from an address
def fetch_pincode_from_address(address):
    encoded_address = urllib.parse.quote(address)
    
    google_url = f"https://maps.googleapis.com/maps/api/geocode/json?address={encoded_address}&key={GOOGLE_API_KEY}"
    try:
        response = requests.get(google_url, timeout=5)
        response.raise_for_status()  
        data = response.json()

        if 'results' in data and data['results']:
            for result in data['results']:
                if 'address_components' in result:
                    for component in result['address_components']:
                        if 'postal_code' in component['types']:
                            return component['long_name']  
    except requests.exceptions.RequestException as e:
        print(f"Google API Error: {e}")

    # Fallback: Nominatim API (OpenStreetMap)
    nominatim_url = f"https://nominatim.openstreetmap.org/search?format=json&q={encoded_address}&addressdetails=1"
    try:
        response = requests.get(nominatim_url, timeout=5)
        response.raise_for_status()  
        data = response.json()

        if data:
            for item in data:
                if 'address' in item and 'postcode' in item['address']:
                    pincode = item['address']['postcode']
                    if pincode:
                        return pincode
    except requests.exceptions.RequestException as e:
        print(f"Nominatim API Error: {e}")

    # Fallback to Zippopotam API
    fallback_url = f"http://api.zippopotam.us/in/{encoded_address}"
    try:
        response = requests.get(fallback_url, timeout=5)
        response.raise_for_status()  
        data = response.json()

        if "places" in data and data["places"]:
            pincode = data["places"][0]["post code"]
            if pincode:
                return pincode
    except requests.exceptions.RequestException as e:
        print(f"Zippopotam.us API Error: {e}")

    return "Could not determine pincode"

# Function to check if the entered pincode is correct or provide the correct pincode based on address
def check_pincode(address, entered_pincode, df):
    address = address.strip().lower()
    matching_row = df[df['OfficeName'].str.lower().str.contains(address, na=False)]

    if not matching_row.empty:
        correct_pincode = matching_row.iloc[0]['Pincode']
        if str(entered_pincode) == str(correct_pincode):
            return {"status": "success", "message": "Entered Pincode is correct.", "correct_pincode": correct_pincode}
        else:
            return {"status": "error", "message": f"Entered Pincode is incorrect. Correct Pincode: {correct_pincode}", "correct_pincode": correct_pincode}
    else:
        return {"status": "error", "message": "Address not found in the dataset."}

@app.route('/', methods=['GET', 'POST'])
def upload_image():
    if request.method == 'POST':
        if 'file' not in request.files:
            return jsonify({"status": "error", "message": "No file part"})

        file = request.files['file']
        if file.filename == '':
            return jsonify({"status": "error", "message": "No selected file"})

        # Save the uploaded file
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(filepath)

        # Extract text from image
        extracted_text = pytesseract.image_to_string(Image.open(filepath)).strip()

        if extracted_text:
            detected_pincode = extract_pincode(extracted_text)

            # Load dataset (CSV file)
            df = pd.read_csv('pincode.csv', engine='python', on_bad_lines='skip')

            # Check if the extracted pincode is correct
            if detected_pincode and verify_pincode(detected_pincode):
                final_pincode = detected_pincode
                message = "Pincode is valid."
            else:
                # Use address extraction to get correct pincode if pincode is invalid
                final_pincode = fetch_pincode_from_address(extracted_text)
                # If the pincode is still invalid, check using the dataset based on the address
                if final_pincode == "Could not determine pincode":
                    result = check_pincode(extracted_text, detected_pincode, df)
                    final_pincode = result.get("correct_pincode")
                    message = result["message"]

            return jsonify({
                "status": "success",
                "message": message,
                "extracted_text": extracted_text,
                "correct_pincode": final_pincode
            })

        else:
            return jsonify({"status": "error", "message": "No valid address found in the image!"})

    return render_template('upload.html')

if __name__ == '__main__':
    app.run(debug=True)
