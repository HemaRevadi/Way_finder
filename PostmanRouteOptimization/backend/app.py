from flask import Flask, request, jsonify
from geopy.distance import geodesic
import pymysql
import requests
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

db = pymysql.connect(
    host="localhost",
    user="root",
    password="0707",  
    database="PostmanDB"
)

def get_address_from_coordinates(lat, lon):
    url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json"
    response = requests.get(url, headers={"User-Agent": "PostmanRouteOptimization"})
    
    if response.status_code == 200:
        data = response.json()
        return data.get("display_name", "No address found")
    else:
        return "Error: Unable to fetch address"

@app.route('/compare_address', methods=['POST'])
def compare_address():
    data = request.json
    customer_id = data['CustomerID']
    input_address = data['InputAddress']
    use_gps = data['UseGPS']
    gps_coordinates = data.get('GPSCoordinates', None)

    cursor = db.cursor()

    cursor.execute("SELECT OldAddress, ST_AsText(GPSCoordinates) FROM Deliveries WHERE CustomerID = %s", (customer_id,))
    result = cursor.fetchone()

    if not result:
        return jsonify({"error": "Customer not found"}), 404

    old_address, old_coordinates = result
    old_coordinates = old_coordinates.replace("POINT(", "").replace(")", "").split()
    old_lat, old_lng = float(old_coordinates[0]), float(old_coordinates[1])
    if use_gps:
        if gps_coordinates:
            current_lat, current_lng = gps_coordinates
            distance = geodesic((old_lat, old_lng), (current_lat, current_lng)).meters

            if distance <= 100: 
                return jsonify({"message": "Address matched. No update needed."}), 200

            new_address = get_address_from_coordinates(current_lat, current_lng)
        else:
            return jsonify({"error": "GPS coordinates are missing."}), 400
    else:
     
        if input_address == old_address:
            return jsonify({"message": "Address matched. No update needed."}), 200
        new_address = input_address
    cursor.execute(
        "UPDATE Deliveries SET NewAddress = %s, GPSCoordinates = POINT(%s, %s) WHERE CustomerID = %s",
        (new_address, gps_coordinates[0], gps_coordinates[1], customer_id)
    )
    db.commit()

    return jsonify({"message": "Address updated successfully.", "NewAddress": new_address}), 200

if __name__ == '__main__':
    app.run(debug=True)