# Control your AIRMX Pro right from your Apple Home

The package is a Homebridge plugin for AIRMX Pro, which allows you to
control the AIRMX Pro on Apple Home across your devices, even with Siri.

## Installation

The plugin supports Node 18+ with Homebridge 1.8+ or 2.0. You can install
the plugin via NPM:

```bash
npm i -g homebridge-airmx
```

## Usage

This plugin supports Homebridge UI configuration; you can tweak the settings
from Homebridge UI or edit the `config.json` file manually. Here's a simple
example:

```json
{
  "platforms": {
    {
      "name": "AIRMX",
      "platform": "AIRMX",
      "mqtt": "mqtt://192.168.10.10",
      "devices": [
        {
          "id": 1,
          "key": "<YOUR-DEVICE-KEY>"
        }
      ]
    }
  }
}
```

My local anonymous MQTT server is deployed on my home network, and remember
to update your endpoint. The devices field accepts a list where each item
includes a device ID and the corresponding device key.

Here's the technical specification for the configuration.

<dl>
  <dt>platform: string</dt>
  <dd>The platform name must be set to "AIRMX".</dd>

  <dt>mqtt: string</dt>
  <dd>The broker URL for an MQTT server.</dd>

  <dt>devices: device[]</dt>
  <dd>A list of AIRMX Pro definitions.</dd>

  <dt>device: object</dt>
  <dd>An AIRMX Pro definition.</dd>

  <dt>device.id: number</dt>
  <dd>The device identifier.</dd>

  <dt>device.key: string</dt>
  <dd>The key is used to sign or validate the command messages in the MQTT server.</dd>
</dl>

## License

The package is released under [the MIT license](LICENSE).
