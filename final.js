const { createBluetooth } = require( 'node-ble' );
var util = require('util');
var nodeimu = require( '@trbll/nodeimu' );
var IMU = new nodeimu.IMU( );
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, addDoc, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getDatabase, ref, onValue, set, update, get, child} = require('firebase/database')
 
const firebaseConfig = {
  apiKey: "AIzaSyC4fk2W7b4DkhOU8JNSzLd-nrkNAcUQTaA",
  authDomain: "iot-final-project-bcf7e.firebaseapp.com",
  databaseURL: "https://iot-final-project-bcf7e-default-rtdb.firebaseio.com",
  projectId: "iot-final-project-bcf7e",
  storageBucket: "iot-final-project-bcf7e.appspot.com",
  messagingSenderId: "993994346614",
  appId: "1:993994346614:web:44e49b36256950dba40f57",
  measurementId: "G-TJRZ23LPM4"
};

var admin = require("firebase-admin");
var serviceAccount = require("./iot-final-project-bcf7e-firebase-adminsdk-2vkwr-4334ada1df.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://iot-final-project-bcf7e-default-rtdb.firebaseio.com"
});
 
const firestoreDB = getFirestore(admin.apps[0]);
const realTimeDB = admin.database()
 
// Replace this with your Arduino's Bluetooth address
// as found by running the 'scan on' command in bluetoothctl
const ARDUINO_BLUETOOTH_ADDR = 'B6:19:A7:B0:C7:48';
//const ARDUINO_BLUETOOTH_ADDR2 = '4e:4f:19:3b:d9:be';

const UART_SERVICE_UUID      = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const TX_CHARACTERISTIC_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
const RX_CHARACTERISTIC_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';
 
const EES_SERVICE_UUID       = '0000181a-0000-1000-8000-00805f9b34fb';
const TEMP_CHAR_UUID         = '00002a6e-0000-1000-8000-00805f9b34fb';
const HUM_CHAR_UUID          = '00002a6f-0000-1000-8000-00805f9b34fb';
 
var intervalNumber = 1;
var interval = 10000;
 
async function main( ) {
    // Reference the BLE adapter and begin device discovery...
    const { bluetooth, destroy } = createBluetooth();
    const adapter = await bluetooth.defaultAdapter();
    //This might be the fix for connecting
    if (! await adapter.isDiscovering())
        await adapter.startDiscovery()
    console.log( 'discovering...' );
 
    // Attempt to connect to the device with specified BT address
    const device = await adapter.waitDevice( ARDUINO_BLUETOOTH_ADDR.toUpperCase() );
    //const device2 = await adapter.waitDevice( ARDUINO_BLUETOOTH_ADDR2.toUpperCase() );
    console.log( 'found device. attempting connection...' );
    await device.connect();
    console.log( 'connected to device!' );

    // Run database initialization
    initalizeDatabase()
 
    // Get references to the desired UART service and its characteristics
    const gattServer = await device.gatt();
    const uartService = await gattServer.getPrimaryService( UART_SERVICE_UUID.toLowerCase() );
    const txChar = await uartService.getCharacteristic( TX_CHARACTERISTIC_UUID.toLowerCase() );
    const rxChar = await uartService.getCharacteristic( RX_CHARACTERISTIC_UUID.toLowerCase() );
 
    // Get references to the desired ESS service and its temparature characteristic.
    const ees_Service = await gattServer.getPrimaryService(EES_SERVICE_UUID.toLowerCase());
    const tempChar = await ees_Service.getCharacteristic(TEMP_CHAR_UUID.toLowerCase());
    const humChar = await ees_Service.getCharacteristic(HUM_CHAR_UUID.toLowerCase());
 
    // Register for notifications on the RX characteristic
    await rxChar.startNotifications( );
 
    // Callback for when data is received on RX characteristic
    rxChar.on( 'valuechanged', buffer => {
        console.log('Received: ' + buffer.toString());
    });
 
    // Set up listener for console input.
    // When console input is received, write it to TX characteristic
    const stdin = process.openStdin( );
    stdin.addListener( 'data', async function( d ) {
        let inStr = d.toString( ).trim( );
 
        // Disconnect and exit if user types 'exit'
        if (inStr === 'exit') {
            console.log( 'disconnecting...' );
            await device.disconnect();
            console.log( 'disconnected.' );
            destroy();
            process.exit();
        }
 
        // Specification limits packets to 20 bytes; truncate string if too long.
        inStr = (inStr.length > 20) ? inStr.slice(0,20) : inStr;
 
        // Attempt to write/send value to TX characteristic
        txChar.writeValue(Buffer.from(inStr)).then(() =>
        {
            console.log('Sent: ' + inStr);
        });
    });

    // Register for notifications on the temperature characteristic
    await tempChar.startNotifications();
 
    // Register for notifications on the humidity characteristic
    await humChar.startNotifications()

    // Callback for when data is received on the temp characteristic
    var humidity
    humChar.on('valuechanged', buffer => {
        humidity = (Math.round(buffer.readInt16LE() / 100 * 100) / 100)
        console.log('Humidity (%)= ', humidity);

        updateRealtime(humidity, temperature)

        //turn on arduino
        if (humidity<desiredHumidity){
            txChar.writeValue(Buffer.from("1010"));
            console.log("Turning on relay")
        }

        //turn off arduino
        if(humidity>=desiredHumidity){
            txChar.writeValue(Buffer.from("10"));
            console.log("Turning off relay")
        }

        if(humidity>=desiredHumidity){
            console.log("Humidity is greater than desired value");
        }
    });
 
    // Callback for when data is received on the humidity characteristic
    var temperature
    tempChar.on( 'valuechanged', buffer => {
        temperature = (Math.round(buffer.readInt16LE() / 100 * 100) / 100)
        //console.log('Temperature = ' + (temperature * (9/5)) + 32 + '°F'); //if we want F :)
        console.log('Temperature = ' + temperature + '°C');
    });

    var desiredHumidity = 50 //DEFAULT STARTING VALUE

    // Callback listener for desired humidity
    onValue(ref(realTimeDB, 'sensor1' + '/setHum'), (snapshot) => {
        const data = snapshot.val()
        console.log("Desired Humidity: " + data + "%")

        // If true set the local interval value, and then send to Arduino
        if(data) {
            desiredHumidity = data
        }

        if(desiredHumidity >= 1 && desiredHumidity <= 100) {
            // txChar.writeValue(Buffer.from(desiredHumidity.toString()))
            console.log('Sent Desired Humidity: ' + desiredHumidity + "% to Arduino")
        }
    })

    // Send data to Firestore every minute
    setInterval(async ()=> {
        await updateFirestore(desiredHumidity, humidity, temperature);
        console.log("Sent data to Firestore");
    }, 60001)
}

main().then((ret) => {
    if (ret) console.log( ret );
}).catch((err) => {
    console.log("catching error")
    if (err) console.error( err );  
}); 

// Initialize database to default values
function initalizeDatabase() {
    update(ref(realTimeDB, 'sensor1'), {
        setHum: 50
    })
}

async function updateRealtime(humidity, temperature) {
    update(ref(realTimeDB, 'sensor1'), {
        humidity: humidity,
        temperature: temperature
    })
    console.log("Updating realtime values")
}
 
async function updateFirestore(desiredHumidity, humidity, temperature){
    // Set arduino sensor with address ARDUINO_BLUETOOTH_ADDR the 4 values below
    var timestamp = new Date()
    const sensorData = firestoreDB.collection('Sensor Data ' + ARDUINO_BLUETOOTH_ADDR).doc(timestamp.toString());
    await sensorData.set({
        desiredHumidity : desiredHumidity,
        humidity : humidity,
        temperature : temperature,
        Timestamp : timestamp
    });
}
