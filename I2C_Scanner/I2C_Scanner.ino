#include <Wire.h>

void setup() {
  Serial.begin(115200);
  // ESP32 預設 I2C 腳位
  Wire.begin(21, 22); 
  Serial.println("\nI2C Scanner Started!");
}

void loop() {
  byte error, address;
  int nDevices = 0;

  Serial.println("Scanning I2C bus...");

  for(address = 1; address < 127; address++ ) {
    // 試著與該位址建立連線
    Wire.beginTransmission(address);
    error = Wire.endTransmission();

    if (error == 0) {
      Serial.print("找到 I2C 設備！位址為: 0x");
      if (address < 16)
        Serial.print("0");
      Serial.print(address, HEX);
      Serial.println();
      nDevices++;
    }
    else if (error == 4) {
      Serial.print("位址 0x");
      if (address < 16)
        Serial.print("0");
      Serial.print(address, HEX);
      Serial.println(" 發生未知錯誤");
    }    
  }
  
  if (nDevices == 0) {
    Serial.println("沒有找到任何 I2C 設備 (硬體未連接成功)\n");
  } else {
    Serial.println("掃描完成。\n");
  }

  delay(5000); // 每 5 秒掃描一次
}
