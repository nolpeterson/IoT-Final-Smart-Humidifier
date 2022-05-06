#include <Arduino_HTS221.h>
#include <ArduinoBLE.h>
#include "TimeoutTimer.h"
#define BUFSIZE 20

/*   We'll use the ArduinoBLE library to simulate a basic UART connection 
 *   following this UART service specification by Nordic Semiconductors. 
 *   More: https://learn.adafruit.com/introducing-adafruit-ble-bluetooth-low-energy-friend/uart-service
 */
BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
BLEStringCharacteristic txChar("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", BLEWrite, 20 );
BLEStringCharacteristic rxChar("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLERead | BLENotify, 20 );

/*  Create a Environmental Sensing Service (ESS) and a 
 *  characteristic for its temperature value.
 */
BLEService essService("181A");
BLEShortCharacteristic tempChar("2A6E", BLERead | BLENotify );
BLEShortCharacteristic humChar("2A6F", BLERead | BLENotify );
unsigned long timeFlag = 0;
void setup() 
{
  timeFlag = millis();
  Serial.begin(9600);
  while(!Serial);

  if (!HTS.begin()) {
    Serial.println("Failed to initialize humidity temperature sensor!");
    while (1);
  }

  if ( !BLE.begin() )
  {
    Serial.println("Starting BLE failed!");
    while(1);
  }

  // Get the Arduino's BT address
  String deviceAddress = BLE.address();

  // The device name we'll advertise with.
  BLE.setLocalName("Smart Humidifier");

  // Get UART service ready.
  BLE.setAdvertisedService( uartService );
  uartService.addCharacteristic( txChar );
  uartService.addCharacteristic( rxChar );
  BLE.addService( uartService );

  // Get ESS service ready.
  essService.addCharacteristic( tempChar );
  essService.addCharacteristic( humChar );
  BLE.addService( essService );

  // Start advertising our new service.
  BLE.advertise();
  Serial.println("Bluetooth device (" + deviceAddress + ") active, waiting for connections...");
}

int interval=6000;
void loop() 
{
  // Wait for a BLE central device.
  BLEDevice central = BLE.central();


  // If a central device is connected to the peripheral...
  if ( central )
  {
    // Print the central's BT address.
    Serial.print("Connected to central: ");
    Serial.println( central.address() );

    // While the central device is connected...
    while( central.connected() )
    {
      // Get input from user, send to central
      char inputs[BUFSIZE+1];
      if ( getUserInput( inputs, BUFSIZE ) )
      {
        Serial.print("[Send] ");
        Serial.println( inputs );
        rxChar.writeValue( inputs );
      }

      // Receive data from central (if written is true)
      if(txChar.written()){ 
        Serial.print("[Recv] ");
        Serial.println( txChar.value() );
        int recv = txChar.value().toInt();
        Serial.println(recv);

        if(recv>=1000){
          digitalWrite(8, HIGH);
//          interval=(recv-1000)*6000;
        }

        if(recv<1000){
          digitalWrite(8,LOW);
//          interval=recv*6000;
        }
      }
      /* 
       *  Emit temperature per ESS' tempChar.
       *  Per the characteristic spec, temp should be in Celsius 
       *  with a resolution of 0.01 degrees. It should also 
       *  be carried within short.
      */

      // Get temperature from Arduino sensor (per Lab 1)
      if ((millis() - timeFlag) > interval)
      {
        timeFlag = millis();
        float temp = HTS.readTemperature();

        // Get humidity
        float hum = HTS.readHumidity();
        
        Serial.print("Temp: ");
        Serial.println(temp);
  
        Serial.print("Hum: ");
        Serial.println(hum);
  
        // Cast to desired format; multiply by 100 to keep desired precision.
        short shortHum = (short) (hum * 100);
        short shortTemp = (short) (temp * 100);
  
        // Send data to central for temperature characteristic.
        tempChar.writeValue( shortTemp );
  
        // Send data to central for humidity characteristic.
        humChar.writeValue( shortHum );
      }
    }
      
    }
    
    Serial.print("Disconnected from central: ");
    Serial.println( central.address() );
    
  }


/**************************************************************************/
/*!
    @brief  Checks for user input (via the Serial Monitor)
            From: https://github.com/adafruit/Adafruit_BluefruitLE_nRF51
*/
/**************************************************************************/
bool getUserInput(char buffer[], uint8_t maxSize)
{
  // timeout in 100 milliseconds
  TimeoutTimer timeout(100);

  memset(buffer, 0, maxSize);
  while( (!Serial.available()) && !timeout.expired() ) { delay(1); }

  if ( timeout.expired() ) return false;

  delay(2);
  uint8_t count=0;
  do
  {
    count += Serial.readBytes(buffer+count, maxSize);
    delay(2);
  } while( (count < maxSize) && (Serial.available()) );
  
  return true;
}