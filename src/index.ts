import type {
  API,
  Characteristic,
  CharacteristicValue,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service
} from 'homebridge'

import mqtt from 'mqtt'
import {
  Airmx,
  type EagleStatusData,
  type EagleControlData,
  type EagleStatus
} from 'airmx'

interface Device {
  id: number
  key: string
}

interface AirmxPlatformConfig extends PlatformConfig {
  mqtt: string
  devices: Device[]
}

interface AccessoryContext {
  device: Device
  status?: Pick<
    EagleStatusData,
    | 'power'
    | 'mode'
    | 'cadr'
    | 'g4Percent'
    | 'carbonPercent'
    | 'hepaPercent'
    | 'version'
  >
}

enum EagleMode {
  Manual = 0,
  Ai = 1
}

const pluginIdentifier = 'homebridge-airmx'
const platformName = 'Airmx'

/**
 * The stub control data for initial sending when we don’t have the latest
 * device status available.
 */
const stubControl: EagleControlData = {
  power: 0,
  heatStatus: 0,
  mode: 0,
  cadr: 47,
  denoise: 0
}

class AirmxPlatform implements DynamicPlatformPlugin {
  readonly service: typeof Service
  readonly characteristic: typeof Characteristic

  public readonly accessories: Map<
    string,
    PlatformAccessory<AccessoryContext>
  > = new Map()

  public readonly discoveredUuids: string[] = []

  /**
   * The AIRMX client.
   */
  airmx: Airmx

  constructor(
    readonly log: Logging,
    readonly config: PlatformConfig | AirmxPlatformConfig,
    readonly api: API
  ) {
    this.service = api.hap.Service
    this.characteristic = api.hap.Characteristic

    this.airmx = new Airmx({
      mqtt: mqtt.connect(this.config.mqtt),
      devices: this.config.devices
    })

    this.airmx.onEagleUpdate((status) => {
      this.log.info('Receive a status update from device:', status.deviceId)

      const uuid = this.api.hap.uuid.generate(status.deviceId.toString())
      const accessory = this.accessories.get(uuid)
      if (accessory) {
        this.log.info('Update the current status to device:', status.deviceId)
        accessory.context.status = {
          power: status.power,
          mode: status.mode,
          cadr: status.cadr,
          g4Percent: status.g4Percent,
          carbonPercent: status.carbonPercent,
          hepaPercent: status.hepaPercent,
          version: status.version
        }
      }
    })

    this.api.on('didFinishLaunching', () => {
      this.registerDevices()
      this.cleanUpObsolete()
    })
  }

  configureAccessory(accessory: PlatformAccessory<AccessoryContext>): void {
    this.log.info('Loading accessory from cache:', accessory.context.device.id)
    this.accessories.set(accessory.UUID, accessory)
  }

  private registerDevices() {
    for (const device of this.config.devices) {
      const uuid = this.api.hap.uuid.generate(device.id.toString())
      const existingAccessory = this.accessories.get(uuid)

      if (existingAccessory) {
        this.restoreAccessory(existingAccessory)
      } else {
        const accessory = new this.api.platformAccessory<AccessoryContext>(
          'AIRMX Pro',
          uuid
        )
        accessory.context.device = device
        this.registerAccessory(accessory)
      }

      this.discoveredUuids.push(uuid)
    }
  }

  private cleanUpObsolete() {
    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredUuids.includes(uuid)) {
        this.api.unregisterPlatformAccessories(pluginIdentifier, platformName, [
          accessory
        ])
      }
    }
  }

  private restoreAccessory(
    accessory: PlatformAccessory<AccessoryContext>
  ): void {
    this.log.info(
      'Restoring existing accessory from cache:',
      accessory.context.device.id
    )
    new AirmxProAccessory(this, accessory)
  }

  private registerAccessory(
    accessory: PlatformAccessory<AccessoryContext>
  ): void {
    this.log.info('Adding new accessory:', accessory.context.device.id)
    this.accessories.set(accessory.UUID, accessory)
    new AirmxProAccessory(this, accessory)
    this.api.registerPlatformAccessories(pluginIdentifier, platformName, [
      accessory
    ])
  }
}

export class AirmxProAccessory {
  constructor(
    private readonly platform: AirmxPlatform,
    private readonly accessory: PlatformAccessory<AccessoryContext>
  ) {
    this.registerAccessoryInformation()
    this.registerAirPurifier()
    this.registerFilter()
  }

  private registerAccessoryInformation() {
    const service = this.accessory
      .getService(this.platform.service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.characteristic.Manufacturer,
        'Beijing Miaoxin technology Co., Ltd'
      )
      .setCharacteristic(this.platform.characteristic.Model, 'AIRMX Pro')
      .setCharacteristic(this.platform.characteristic.SerialNumber, 'N/A')

    service
      .getCharacteristic(this.platform.characteristic.FirmwareRevision)
      .onGet(this.handleFirmwareRevisionGet.bind(this))
  }

  private registerAirPurifier() {
    const service =
      this.accessory.getService(this.platform.service.AirPurifier) ||
      this.accessory.addService(this.platform.service.AirPurifier)

    service.setCharacteristic(this.platform.characteristic.Name, 'AIRMX Pro')

    service
      .getCharacteristic(this.platform.characteristic.Active)
      .onGet(this.handleActiveGet.bind(this))
      .onSet(this.handleActiveSet.bind(this))

    service
      .getCharacteristic(this.platform.characteristic.CurrentAirPurifierState)
      .onGet(this.handleCurrentAirPurifierStateGet.bind(this))

    service
      .getCharacteristic(this.platform.characteristic.TargetAirPurifierState)
      .onGet(this.handleTargetAirPurifierStateGet.bind(this))
      .onSet(this.handleTargetAirPurifierStateSet.bind(this))

    service
      .getCharacteristic(this.platform.characteristic.RotationSpeed)
      .onGet(this.handleRotationSpeedGet.bind(this))
      .onSet(this.handleRotationSpeedSet.bind(this))
  }

  private registerFilter() {
    const service =
      this.accessory.getService(this.platform.service.FilterMaintenance) ||
      this.accessory.addService(this.platform.service.FilterMaintenance)

    service
      .getCharacteristic(this.platform.characteristic.FilterChangeIndication)
      .onGet(this.handleFilterChangeIndicationGet.bind(this))

    service
      .getCharacteristic(this.platform.characteristic.FilterLifeLevel)
      .onGet(this.handleFilterLifeLevelGet.bind(this))
  }

  handleFirmwareRevisionGet() {
    const { status } = this.accessory.context
    return status?.version || 'N/A'
  }

  handleActiveGet() {
    const { status } = this.accessory.context
    return status !== undefined && status.power === 1
      ? this.platform.characteristic.Active.ACTIVE
      : this.platform.characteristic.Active.INACTIVE
  }

  handleActiveSet(value: CharacteristicValue) {
    const isOn = value === this.platform.characteristic.Active.ACTIVE

    if (!this.accessory.context.status) {
      this.sendRawControl({ power: isOn ? 1 : 0 })
      return
    }

    const device = this.platform.airmx.device(this.accessory.context.device.id)
    isOn ? device.on() : device.off()
  }

  handleCurrentAirPurifierStateGet() {
    const { status } = this.accessory.context
    return status !== undefined && status.power === 1
      ? this.platform.characteristic.CurrentAirPurifierState.PURIFYING_AIR
      : this.platform.characteristic.CurrentAirPurifierState.INACTIVE
  }

  handleTargetAirPurifierStateGet() {
    const { status } = this.accessory.context
    return status !== undefined && status.mode === EagleMode.Ai
      ? this.platform.characteristic.TargetAirPurifierState.AUTO
      : this.platform.characteristic.TargetAirPurifierState.MANUAL
  }

  handleTargetAirPurifierStateSet(value: CharacteristicValue) {
    const { status } = this.accessory.context
    const isAuto =
      value === this.platform.characteristic.TargetAirPurifierState.AUTO

    if (!status) {
      this.sendRawControl({
        power: 1,
        mode: isAuto ? EagleMode.Ai : EagleMode.Manual
      })
      return
    }

    const device = this.platform.airmx.device(this.accessory.context.device.id)

    isAuto ? device.ai() : device.cadr(status.cadr)
  }

  handleRotationSpeedGet() {
    const { status } = this.accessory.context
    return status?.cadr || 0
  }

  handleRotationSpeedSet(value: CharacteristicValue) {
    const { device, status } = this.accessory.context

    if (!status) {
      this.sendRawControl({
        power: 1,
        mode: EagleMode.Manual,
        cadr: value as number
      })
      return
    }

    this.platform.airmx.device(device.id).cadr(value as number)
  }

  handleFilterChangeIndicationGet() {
    const { status } = this.accessory.context
    if (status === undefined) {
      return this.platform.characteristic.FilterChangeIndication.FILTER_OK
    }
    const maxPercent = Math.max(
      status.g4Percent,
      status.carbonPercent,
      status.hepaPercent
    )
    const threshold = 80
    return maxPercent > threshold
      ? this.platform.characteristic.FilterChangeIndication.CHANGE_FILTER
      : this.platform.characteristic.FilterChangeIndication.FILTER_OK
  }

  handleFilterLifeLevelGet() {
    const { status } = this.accessory.context
    if (status === undefined) {
      return 100
    }
    const maxPercent = Math.max(
      status.g4Percent,
      status.carbonPercent,
      status.hepaPercent
    )
    return 100 - maxPercent
  }

  private sendRawControl(data: Partial<EagleControlData>) {
    this.platform.airmx.control(this.accessory.context.device.id, {
      ...stubControl,
      ...data
    })
  }
}

export default (api: API) => {
  api.registerPlatform(platformName, AirmxPlatform)
}
