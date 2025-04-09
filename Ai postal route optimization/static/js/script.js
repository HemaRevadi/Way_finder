document.getElementById('add-address').addEventListener('click', function() {
    const addressInputs = document.getElementById('address-inputs');
    

    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.name = 'addresses[]'; 
    newInput.placeholder = 'Enter address';
    

    addressInputs.appendChild(newInput);
});