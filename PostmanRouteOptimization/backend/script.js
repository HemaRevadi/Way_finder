document.getElementById("submitBtn").addEventListener("click", async function () {
    const customerId = document.getElementById("customerId").value;
    const address = document.getElementById("address").value;
    const useGPS = document.getElementById("useGPS").checked;
    const messageDiv = document.getElementById("message");
  
    let gpsCoordinates = null;
    if (useGPS) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            gpsCoordinates = [position.coords.latitude, position.coords.longitude];
            sendData();
          },
          (error) => {
            messageDiv.className = "message error";
            messageDiv.textContent = "Error fetching GPS location: " + error.message;
          }
        );
      } else {
        messageDiv.className = "message error";
        messageDiv.textContent = "GPS is not supported by this browser.";
      }
    } else {
      sendData();
    }
  
    async function sendData() {
      const data = {
        CustomerID: customerId,
        InputAddress: address,
        UseGPS: useGPS,
        GPSCoordinates: gpsCoordinates,
      };
  
      try {
        const response = await fetch("http://localhost:5000/compare_address", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
  
        const result = await response.json();
        if (response.ok) {
          messageDiv.className = "message success";
          messageDiv.textContent = result.message;
        } else {
          messageDiv.className = "message error";
          messageDiv.textContent = result.error;
        }
      } catch (error) {
        messageDiv.className = "message error";
        messageDiv.textContent = "Error connecting to server: " + error.message;
      }
    }
  });