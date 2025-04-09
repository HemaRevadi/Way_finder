from flask import Flask, render_template, request, jsonify
import requests
import os

app = Flask(__name__)

GOOGLE_MAPS_API_KEY = os.getenv('GMAPS_API_KEY')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/optimize', methods=['POST'])
def optimize():
    addresses = request.form.getlist('addresses[]')  
    geolocations = []


    for address in addresses:
        response = requests.get(
            f'https://maps.googleapis.com/maps/api/geocode/json?address={address}&key={GOOGLE_MAPS_API_KEY}'
        )
        data = response.json()
        
        if data['status'] == 'OK':
            location = data['results'][0]['geometry']['location']
            geolocations.append((address, (location['lat'], location['lng'])))  
        else:
            return jsonify({'error': f'Geocoding failed for address: {address}'}), 400

    
    optimized_route = get_optimized_route(geolocations)

    return render_template('map.html', optimized_route=optimized_route)

def get_optimized_route(locations):
    waypoints = '|'.join([f"{lat},{lng}" for _, (lat, lng) in locations])
    
    
    response = requests.get(
        f'https://maps.googleapis.com/maps/api/directions/json?origin={waypoints.split("|")[0]}&destination={waypoints.split("|")[-1]}&waypoints=optimize:true|{waypoints[1:-1]}&key={GOOGLE_MAPS_API_KEY}'
    )
    
    if response.status_code != 200:
        raise Exception("Error fetching directions")

    return response.json()

if __name__ == '__main__':
   app.run(host='0.0.0.0', port=5003, debug=True)