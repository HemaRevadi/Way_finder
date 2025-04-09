import pandas as pd
import mysql.connector
import numpy as np

# MySQL Database Configuration
db_config = {
    "host": "localhost",
    "user": "root",
    "password": "yourpassword",
    "database": "postal_db"
}

# Load the Excel file
df = pd.read_excel(r"C:\pin-code-processor\database\final_pincode_set.xlsx")

# Ensure no NaN values are inserted
df.fillna("Unknown", inplace=True)

# Connect to MySQL
connection = mysql.connector.connect(**db_config)
cursor = connection.cursor()

# Insert data into MySQL
for index, row in df.iterrows():
    pincode = str(row.iloc[0])  # Use .iloc instead of []
    head_office = str(row.iloc[1])  # Convert NaN to string
    district = str(row.iloc[2])

    if pincode.lower() == "nan":  # Skip empty rows
        continue

    query = "INSERT INTO post_offices (pincode, head_post_office, district) VALUES (%s, %s, %s)"
    cursor.execute(query, (pincode, head_office, district))

# Commit changes
connection.commit()
cursor.close()
connection.close()

print("Data successfully imported into MySQL.")
