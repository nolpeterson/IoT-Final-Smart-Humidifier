
var util = require('util');
var firebase = require( 'firebase/app' );
var nodeimu = require( '@trbll/nodeimu' );
var IMU = new nodeimu.IMU( );
var sense = require( '@trbll/sense-hat-led' );


const firebaseConfig = {
  apiKey: "AIzaSyClRUfcLnfYRl2uoVTZ6KVSeJo0-KcKiJQ",
  authDomain: "iot-lab-2-e6d9a.firebaseapp.com",
  projectId: "iot-lab-2-e6d9a",
  storageBucket: "iot-lab-2-e6d9a.appspot.com",
  messagingSenderId: "530127024329",
  appId: "1:530127024329:web:e65634ce8843b803565d18",
  measurementId: "G-57JEJKQ09C"
};

const app = firebase.initializeApp( firebaseConfig );

const { getDatabase, ref, onValue, set, update, get, child} = require('firebase/database');
const { setPixel } = require('@trbll/sense-hat-led');

const database = getDatabase(app);

const { createBluetooth } = require( 'node-ble' );

// TODO: Replace this with your Arduino's Bluetooth address
// as found by running the 'scan on' command in bluetoothctl
const ARDUINO_BLUETOOTH_ADDR = 'B6:19:A7:B0:C7:48';

const UART_SERVICE_UUID      = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const TX_CHARACTERISTIC_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
const RX_CHARACTERISTIC_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

const EES_SERVICE_UUID       = '0000181a-0000-1000-8000-00805f9b34fb';
const HUM_CHAR_UUID         = '00002a6f-0000-1000-8000-00805f9b34fb';
var intervalNumber = 1;

async function main( )
{   
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
    // TODO
    const ees_Service=await gattServer.getPrimaryService(EES_SERVICE_UUID.toLowerCase());
    const humchar = await ees_Service.getCharacteristic(HUM_CHAR_UUID.toLowerCase());

    // Register for notifications on the RX characteristic
    //await rxChar.startNotifications( );

    // Callback for when data is received on RX characteristic
    //rxChar.on( 'valuechanged', buffer =>
    //{
    //    console.log('Received: ' + buffer.toString());
    //});

    // Register for notifications on the temperature characteristic
    // TODO
    await humchar.startNotifications();

    // Callback for when data is received on the temp characteristic
    // TODO
    humchar.on( 'valuechanged', buffer =>
    {
	      hum=buffer.readUInt16LE(0).toString(16);
	      hum=parseInt(hum, 16);
	      hum=hum/100;
	      console.log('Humidity (%)= ', hum);

        update(ref(database,'IMU'), 
        {
        'humidityData': hum,
        });

    });

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

  const db = getDatabase(app);
  var light1;

  const light = ref(db, 'color/update_light');
  onValue(light, (snapshot) => {
  light1 = snapshot.val();
  console.log(light1);

  if(light1==true){

    get (ref(db, 'color/RGB')).then((snapshot)=>
    {
      var data = snapshot.val();
      
      console.log('The (' + data.light_col +' , ' + data.light_row + ') light has been changed to ' + data.light_r + ' ' + data.light_g + ' ' + data.light_b);
  
      sense.setPixel(data.light_col,data.light_row,data.light_r,data.light_g,data.light_b);
    
      update(ref(database,'color'), {
      'update_light': false,
      });

      });
    
   };
  });

  var interval = ref(db, 'Interval');
  onValue(interval, (snapshot) =>{
  intervalNumber=snapshot.val();
  
  if(intervalNumber>10)
  {
    intervalNumber=10;
  
  };

  if(intervalNumber<1)
  {
    intervalNumber=1;
    
  }

  console.log('The interval is ' + intervalNumber);

  var intervalString=intervalNumber.toString();

// Attempt to write/send value to TX characteristic
txChar.writeValue(Buffer.from(intervalString)).then(() =>
      {
          console.log('Sent: ' + intervalNumber);
      });

});





};


main().then((ret) =>
{
    if (ret) console.log( ret );
}).catch((err) =>
{
    if (err) console.error( err );
});
