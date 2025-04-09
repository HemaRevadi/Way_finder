from flask import Flask, render_template, request, send_file
import pandas as pd
import mysql.connector
import os

app = Flask(__name__)
UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "output"
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["OUTPUT_FOLDER"] = OUTPUT_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

db_config = {
    "host": "localhost",
    "user": "root",
    "password": "0707",
    "database": "postal_db"
}

@app.route("/")
def index():
    return render_template("front.html")

@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return "No file uploaded", 400
    file = request.files["file"]
    if file.filename == "":
        return "No selected file", 400
    file_path = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
    file.save(file_path)
    output_file = process_excel(file_path)
    return render_template("result.html", output_file=output_file)

def process_excel(file_path):
    df = pd.read_excel(file_path)
    
    if df.shape[1] < 1:
        return None
    df.columns = ["pincode"] 

    connection = mysql.connector.connect(**db_config)
    cursor = connection.cursor()

    output_data = []
    for index, row in df.iterrows():
        pincode = int(row["pincode"]) if pd.notna(row["pincode"]) else None
        if not pincode:
            continue
        query = "SELECT head_post_office, district FROM post_offices WHERE pincode = %s"
        cursor.execute(query, (pincode,))
        result = cursor.fetchone()
        head_office, district = result if result else ("Not Found", "Not Found")
        output_data.append((pincode, head_office, district))
    cursor.close()
    connection.close()

    output_df = pd.DataFrame(output_data, columns=["Pincode", "Head Post Office", "District"])
    output_file = os.path.join(app.config["OUTPUT_FOLDER"], "output.xlsx")
    output_df.to_excel(output_file, index=False)

    return output_file

@app.route("/download")
def download():
    output_file = os.path.join(app.config["OUTPUT_FOLDER"], "output.xlsx")
    return send_file(output_file, as_attachment=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
