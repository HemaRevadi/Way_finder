import mysql.connector

def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="0707",
        database="postal_db",
        auth_plugin: 'mysql_native_password' 
    )

