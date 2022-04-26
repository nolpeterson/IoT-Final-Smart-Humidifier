var util = require('util');
var nodeimu = require( '@trbll/nodeimu' );
var IMU = new nodeimu.IMU( );

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

const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, addDoc, Timestamp, FieldValue } = require('firebase-admin/firestore');

var admin = require("firebase-admin");

var serviceAccount = require("./iot-final-project-bcf7e-firebase-adminsdk-2vkwr-4334ada1df.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://iot-final-project-bcf7e-default-rtdb.firebaseio.com"
});

const db = getFirestore(admin.apps[0]);

const { createBluetooth } = require( 'node-ble' );

// TODO: Replace this with your Arduino's Bluetooth address
// as found by running the 'scan on' command in bluetoothctl
const ARDUINO_BLUETOOTH_ADDR = 'B6:19:A7:B0:C7:48';

const UART_SERVICE_UUID      = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const TX_CHARACTERISTIC_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
const RX_CHARACTERISTIC_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

const EES_SERVICE_UUID       = '0000181a-0000-1000-8000-00805f9b34fb';
const TEMP_CHAR_UUID         = '00002a6e-0000-1000-8000-00805f9b34fb';
var intervalNumber = 1;

async function main( ) {
  // Write to Firestore, Collection is device's bluetooth address, collection is the time event, and data is fields in collection
  var timestamp = new Date()
  const sensorData = db.collection('Sensor Data' + ARDUINO_BLUETOOTH_ADDR).doc(timestamp.toString());
  await sensorData.set({
    desiredHumidity : 20,
    humidity : 7,
    temperature : 25,
    Timestamp : timestamp
  });

  // Reference the BLE adapter and begin device discovery...
  const { bluetooth, destroy } = createBluetooth();
  const adapter = await bluetooth.defaultAdapter();
  const discovery =  await adapter.startDiscovery();
  console.log( 'discovering...' );

  // Attempt to connect to the device with specified BT address
  const device = await adapter.waitDevice( ARDUINO_BLUETOOTH_ADDR.toUpperCase() );
  console.log( 'found device. attempting connection...' );
  await device.connect();
  console.log( 'connected to device!' );

  // Get references to the desired UART service and its characteristics
  const gattServer = await device.gatt();
  const uartService = await gattServer.getPrimaryService( UART_SERVICE_UUID.toLowerCase() );
  const txChar = await uartService.getCharacteristic( TX_CHARACTERISTIC_UUID.toLowerCase() );
  const rxChar = await uartService.getCharacteristic( RX_CHARACTERISTIC_UUID.toLowerCase() );

  // Get references to the desired ESS service and its temparature characteristic.
  const ees_Service=await gattServer.getPrimaryService(EES_SERVICE_UUID.toLowerCase());
  const tempchar = await ees_Service.getCharacteristic(TEMP_CHAR_UUID.toLowerCase());

  // Register for notifications on the temperature characteristic
  // TODO
  await tempchar.startNotifications();

  // Callback for when data is received on the temp characteristic
  // TODO

  // Set up listener for console input.
  // When console input is received, write it to TX characteristic
  const stdin = process.openStdin( );
  stdin.addListener( 'data', async function( d )
  {
      let inStr = d.toString( ).trim( );

      // Disconnect and exit if user types 'exit'
      if (inStr === 'exit')
      {
          console.log( 'disconnecting...' );
          await device.disconnect();
          console.log( 'disconnected.' );
          destroy();
          process.exit();
      }

      // Specification limits packets to 20 bytes; truncate string if too long.
      inStr = (inStr.length > 20) ? inStr.slice(0,20) : inStr;

      // Attempt to write/send value to TX characteristic
      await txChar.writeValue(Buffer.from(inStr)).then(() =>
      {
          console.log('Sent: ' + inStr);
      });
  });

}

main().then((ret) =>
{
    if (ret) console.log( ret );
}).catch((err) =>
{
    if (err) console.error( err );
});

/*
Error: Value for argument "documentPath" is not a valid resource path. Path must be a non-empty string.
    at Object.validateResourcePath (/home/pi/final/node_modules/@google-cloud/firestore/build/src/path.js:446:15)
    at CollectionReference.doc (/home/pi/final/node_modules/@google-cloud/firestore/build/src/reference.js:2061:20)
    at main (/home/pi/final/final.ts:45:76)
    at Object.<anonymous> (/home/pi/final/final.ts:111:1)
    at Module._compile (node:internal/modules/cjs/loader:1103:14)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1155:10)
    at Module.load (node:internal/modules/cjs/loader:981:32)
    at Function.Module._load (node:internal/modules/cjs/loader:822:12)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:77:12)
    at node:internal/main/run_main_module:17:47

*/
