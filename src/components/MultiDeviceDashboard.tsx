// Multi-Device Dashboard Component
import { useState, useEffect } from 'react';
import { MultiDeviceEventService } from '../utils/multiDeviceEvents';
import { DeviceRegistry } from '../utils/deviceRegistry';
import { DeviceDiscoveryService, NetworkDevice } from '../utils/deviceDiscovery';
import HlsVideoPlayer from './HlsVideoPlayer';

interface HlsStream {
  id: string;
  name: string;
  hlsUrl: string | null;
  active: boolean;
}

interface MultiDeviceDashboardProps {
  eventService: MultiDeviceEventService;
  deviceRegistry: DeviceRegistry;
  discoveryService: DeviceDiscoveryService;
  hlsStreams: HlsStream[];
}

export const MultiDeviceDashboard = ({
  eventService: _eventService,
  deviceRegistry: _deviceRegistry,
  discoveryService,
  hlsStreams,
}: MultiDeviceDashboardProps) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'discovery' | 'feeds'>('overview');
  const [discoveredDevices, setDiscoveredDevices] = useState<NetworkDevice[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  useEffect(() => {
    const refresh = () => setDiscoveredDevices(discoveryService.getDiscoveredDevices());
    refresh();
    const interval = setInterval(refresh, 5_000);
    return () => clearInterval(interval);
  }, [discoveryService]);

  const handleStartDiscovery = async () => {
    setIsDiscovering(true);
    try {
      await discoveryService.startDiscovery();
      setDiscoveredDevices(discoveryService.getDiscoveredDevices());
    } catch (error) {
      console.error('Failed to start discovery:', error);
    } finally {
      setIsDiscovering(false);
    }
  };

  const totalDevices  = discoveredDevices.length;
  const onlineDevices = discoveredDevices.filter(d => d.status === 'responding').length;
  const activeStreams  = hlsStreams.filter(s => s.hlsUrl && s.active).length;

  const tabs = [
    { id: 'overview',   name: 'Overview',   icon: '📊' },
    { id: 'devices',    name: 'Devices',     icon: '📱' },
    { id: 'discovery',  name: 'Discovery',   icon: '🔍' },
    { id: 'feeds',      name: 'Live Feeds',  icon: '📹' },
  ] as const;

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
            <div className="flex space-x-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{totalDevices}</div>
                <div className="text-sm text-gray-500">Devices</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{onlineDevices}</div>
                <div className="text-sm text-gray-500">Online</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{activeStreams}</div>
                <div className="text-sm text-gray-500">Live Feeds</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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

        {/* ── Overview ─────────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">Registered Devices</h2>
              {discoveredDevices.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                  No devices registered yet. Open the app on another device to see it appear here.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {discoveredDevices.map((device) => {
                    const isOnline = device.status === 'responding';
                    return (
                      <div key={device.id} className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-base font-semibold text-gray-900 truncate">
                            {device.deviceInfo?.deviceName ?? 'Unknown Device'}
                          </h3>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 space-y-1">
                          {device.deviceInfo?.deviceType && (
                            <div className="flex justify-between">
                              <span>Type:</span>
                              <span className="font-medium text-gray-700">{device.deviceInfo.deviceType}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Last seen:</span>
                            <span className="font-medium text-gray-700">{device.lastSeen.toLocaleTimeString()}</span>
                          </div>
                          {device.ipAddress && (
                            <div className="flex justify-between">
                              <span>IP:</span>
                              <span className="font-mono text-xs text-gray-600">{device.ipAddress}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Devices ──────────────────────────────────────────────────────────── */}
        {activeTab === 'devices' && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Device Status</h2>
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Seen</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {discoveredDevices.map((device) => {
                    const isOnline = device.status === 'responding';
                    return (
                      <tr key={device.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {device.deviceInfo?.deviceName ?? 'Unknown Device'}
                          </div>
                          <div className="text-xs text-gray-400 font-mono">{device.id.slice(0, 16)}…</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {device.deviceInfo?.deviceType ?? '—'}
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                          {device.ipAddress ?? '—'}
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

        {/* ── Discovery ────────────────────────────────────────────────────────── */}
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {discoveredDevices.map((device) => {
                    const isOnline = device.status === 'responding';
                    return (
                      <tr key={device.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {device.deviceInfo?.deviceName ?? 'Unknown Device'}
                          </div>
                          <div className="text-xs text-gray-400 font-mono">{device.id.slice(0, 16)}…</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {device.deviceInfo?.deviceType ?? 'Unknown'}
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

        {/* ── Live Feeds ───────────────────────────────────────────────────────── */}
        {activeTab === 'feeds' && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Live Camera Feeds</h2>
            {hlsStreams.filter(s => s.hlsUrl).length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                No active camera streams. Add cameras in the Cameras tab.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {hlsStreams.filter(s => s.hlsUrl).map(stream => (
                  <div key={stream.id} className="bg-black rounded-lg overflow-hidden shadow-lg">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-900">
                      <span className="text-sm font-medium text-white truncate">{stream.name}</span>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        stream.active ? 'text-green-400' : 'text-gray-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${stream.active ? 'bg-green-400' : 'bg-gray-500'}`} />
                        {stream.active ? 'Live' : 'Inactive'}
                      </span>
                    </div>
                    <HlsVideoPlayer src={stream.hlsUrl!} label={stream.name} className="w-full" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
