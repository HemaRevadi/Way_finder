import os
import pandas as pd
from flask import Flask, render_template, request, redirect, flash
from flask_wtf import FlaskForm
from flask_wtf.file import FileField, FileAllowed
from wtforms import SubmitField
import pytesseract
from PIL import Image
import re  # For regex operations

# Set path for Tesseract executable (update this path as necessary)
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'your_default_secret_key')  # Use an environment variable for production

# Load pincode dataset into a DataFrame
pincode_df = pd.read_csv('pincode.csv')
pincode_df.columns = pincode_df.columns.str.lower().str.strip()

# Configuration for file uploads
app.config['UPLOAD_FOLDER'] = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

class UploadForm(FlaskForm):
    image = FileField('Upload Image', validators=[FileAllowed(ALLOWED_EXTENSIONS, 'Images only!')])
    submit = SubmitField('Submit')

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/', methods=['GET', 'POST'])
def upload_image():
    form = UploadForm()
    if form.validate_on_submit():
        file = form.image.data
        
        if file and allowed_file(file.filename):
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
            file.save(filepath)

            extracted_text = pytesseract.image_to_string(Image.open(filepath))
            print("Extracted Text:", extracted_text) 

            address = extracted_text.strip()
            print("Final Address Used:", address)  

            if address:
                pincode_found = extract_pincode(address)
                
                if pincode_found:
                    print(f"Extracted Pincode: {pincode_found}")  
                    
                    correct_pincode = validate_pincode(pincode_found)
                    if correct_pincode:
                        flash(f'Provided Pincode: {pincode_found} is correct.', 'info')
                    else:
                        # If the provided pincode is incorrect, fetch the correct one
                        flash(f'Provided Pincode: {pincode_found} is incorrect. Fetching correct pincode...', 'warning')
                        correct_pincode = fetch_correct_pincode(address)
                        if correct_pincode:
                            flash(f'Correct Pincode: {correct_pincode}', 'info')
                        else:
                            flash('Could not determine a correct pincode from the provided address.', 'danger')
                else:
                    # If no pincode was found in the text, attempt to fetch one based on the address
                    flash('No valid pincode found in the extracted text. Attempting to fetch a pincode based on the address...', 'warning')
                    correct_pincode = fetch_correct_pincode(address)
                    if correct_pincode:
                        flash(f'Correct Pincode: {correct_pincode}', 'info')
                    else:
                        flash('Could not determine a correct pincode from the provided address.', 'danger')

            else:
                flash('No valid address found!', 'danger')

            return redirect('/')
    
    return render_template('upload.html', form=form)

def extract_pincode(text):
    """Extracts a pincode from the text using regex."""
    match = re.search(r'\b\d{6}\b', text)  
    return match.group(0) if match else None

def validate_pincode(pincode):
    """Validates whether the provided pincode exists in the dataset."""
    return any(pincode_df['pincode'].astype(str).str.contains(str(pincode)))

def fetch_correct_pincode(address):
    """Fetches the correct pincode based on the provided address from the dataset."""
    matched_row = pincode_df[pincode_df['officename'].str.contains(address.split(',')[0], case=False)]
    
    if not matched_row.empty:
        return matched_row.iloc[0]['pincode']
    
    return None

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=True)