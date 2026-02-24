// Multi-Device Dashboard Component
import { useState, useEffect } from 'react';
import { MultiDeviceEventService, DeviceEventSummary, LocationEventSummary } from '../utils/multiDeviceEvents';
import { DeviceRegistry } from '../utils/deviceRegistry';
import { DeviceDiscoveryService, NetworkDevice } from '../utils/deviceDiscovery';

interface MultiDeviceDashboardProps {
  eventService: MultiDeviceEventService;
  deviceRegistry: DeviceRegistry;
  discoveryService: DeviceDiscoveryService;
}

interface DashboardStats {
  totalDevices: number;
  onlineDevices: number;
  eventsToday: number;
  alertLevel: 'low' | 'medium' | 'high';
  locations: number;
}

export const MultiDeviceDashboard = ({
  eventService,
  deviceRegistry,
  discoveryService
}: MultiDeviceDashboardProps) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'locations' | 'discovery'>('overview');
  const [stats, setStats] = useState<DashboardStats>({
    totalDevices: 0,
    onlineDevices: 0,
    eventsToday: 0,
    alertLevel: 'low',
    locations: 0
  });
  const [deviceSummaries, setDeviceSummaries] = useState<DeviceEventSummary[]>([]);
  const [locationSummaries, setLocationSummaries] = useState<LocationEventSummary[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<NetworkDevice[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  useEffect(() => {
    const updateDashboard = () => {
      // Get device summaries
      const deviceSums = eventService.getDeviceEventSummaries();
      setDeviceSummaries(deviceSums);

      // Get location summaries
      const locationSums = eventService.getLocationEventSummaries();
      setLocationSummaries(locationSums);

      // Calculate overall stats
      const totalEvents = deviceSums.reduce((sum: number, device: DeviceEventSummary) => sum + device.eventsToday, 0);
      const onlineCount = deviceSums.filter((device: DeviceEventSummary) => 
        deviceSums.find((d: DeviceEventSummary) => d.deviceId === device.deviceId)
      ).length;

      setStats({
        totalDevices: deviceSums.length,
        onlineDevices: onlineCount,
        eventsToday: totalEvents,
        alertLevel: totalEvents > 50 ? 'high' : totalEvents > 20 ? 'medium' : 'low',
        locations: locationSums.length
      });

      // Update discovered devices
      setDiscoveredDevices(discoveryService.getDiscoveredDevices());
    };

    updateDashboard();
    const interval = setInterval(updateDashboard, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [eventService, deviceRegistry, discoveryService]);

  const handleStartDiscovery = async () => {
    setIsDiscovering(true);
    try {
      await discoveryService.startDiscovery();
    } catch (error) {
      console.error('Failed to start discovery:', error);
    }
  };

const getAlertColor = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-green-600 bg-green-50';
    }
  };

  const getStatusColor = (status: 'online' | 'offline' | 'error') => {
    switch (status) {
      case 'online': return 'text-green-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Security Network</h1>
              <p className="text-gray-600">Multi-device monitoring dashboard</p>
            </div>
            
            {/* Real-time stats */}
            <div className="flex space-x-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.totalDevices}</div>
                <div className="text-sm text-gray-500">Devices</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.onlineDevices}</div>
                <div className="text-sm text-gray-500">Online</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.eventsToday}</div>
                <div className="text-sm text-gray-500">Events Today</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold rounded-full px-3 py-1 ${getAlertColor(stats.alertLevel)}`}>
                  {stats.alertLevel.toUpperCase()}
                </div>
                <div className="text-sm text-gray-500">Alert Level</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {[
              { id: 'overview', name: 'Overview', icon: '📊' },
              { id: 'devices', name: 'Devices', icon: '📱' },
              { id: 'locations', name: 'Locations', icon: '📍' },
              { id: 'discovery', name: 'Discovery', icon: '🔍' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              >
                <span>{tab.icon}</span>
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Location Grid */}
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">Locations Overview</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {locationSummaries.map((location) => (
                  <div key={location.locationName} className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900">{location.locationName}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getAlertColor(location.alertLevel)}`}>
                        {location.alertLevel}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500">Devices</div>
                        <div className="font-medium">{location.devices}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Events Today</div>
                        <div className="font-medium">{location.eventsToday}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Active</div>
                        <div className="font-medium">{location.activeDetections}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Last Activity</div>
                        <div className="font-medium">{location.lastActivity.toLocaleTimeString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h2>
              <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                  <div className="space-y-4">
                    {eventService.getAggregatedEvents({ limit: 10 }).map((event: any) => (
                      <div key={event.id} className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">
                            {event.sourceDevice.name} - {event.sourceDevice.location}
                          </div>
                          <div className="text-sm text-gray-500">
                            {event.detections.length} detection(s) • {event.timestamp.toLocaleString()}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <span className="text-sm text-gray-400">
                            {Math.round(event.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'devices' && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Device Status</h2>
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Device
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Events Today
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Event
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Alert Level
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {deviceSummaries.map((device) => (
                    <tr key={device.deviceId}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{device.deviceName}</div>
                        <div className="text-sm text-gray-500">{device.deviceId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor('online')} bg-green-100`}>
                          Online
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {device.eventsToday}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {device.lastEventTime.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getAlertColor(device.alertLevel)}`}>
                          {device.alertLevel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'locations' && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Location Details</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {locationSummaries.map((location) => (
                <div key={location.locationName} className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">{location.locationName}</h3>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Connected Devices:</span>
                      <span className="font-medium">{location.devices}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Events Today:</span>
                      <span className="font-medium">{location.eventsToday}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Active Detections:</span>
                      <span className="font-medium">{location.activeDetections}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Alert Level:</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getAlertColor(location.alertLevel)}`}>
                        {location.alertLevel}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Last Activity:</span>
                      <span className="font-medium">{location.lastActivity.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Device list for this location */}
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Devices:</h4>
                    <div className="space-y-2">
                      {deviceSummaries
                        .filter(device => device.deviceName.includes(location.locationName) || Math.random() > 0.5)
                        .map(device => (
                          <div key={device.deviceId} className="flex items-center justify-between text-sm">
                            <span>{device.deviceName}</span>
                            <span className={`w-2 h-2 rounded-full ${getStatusColor('online') === 'text-green-600' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'discovery' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Registered Devices</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Devices that have opened the app and registered. Online status updates every 30 s.
                </p>
              </div>
              <button
                type="button"
                onClick={handleStartDiscovery}
                disabled={isDiscovering}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
              >
                {isDiscovering && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                )}
                <span>{isDiscovering ? 'Refreshing…' : 'Refresh'}</span>
              </button>
            </div>

            <div className="bg-white shadow rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Device
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Seen
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {discoveredDevices.map((device) => {
                    const isOnline = device.status === 'responding';
                    return (
                      <tr key={device.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {device.deviceInfo?.deviceName || 'Unknown Device'}
                          </div>
                          <div className="text-xs text-gray-400 font-mono">{device.id.slice(0, 16)}…</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {device.deviceInfo?.deviceType || 'Unknown'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {device.lastSeen.toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {discoveredDevices.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  No devices registered yet. Open the app on another device to see it appear here.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};