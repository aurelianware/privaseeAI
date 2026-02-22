import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, Bell, Shield, Eye, Zap } from 'lucide-react';
import syncQueueService, { SyncStatus } from '../utils/syncQueue';

interface Settings {
  confidenceThreshold: number;
  humanDetection: boolean;
  motionDetection: boolean;
  notifications: boolean;
  cloudSync: boolean;
  managedContainer?: boolean;
  azureConfig?: {
    accountName: string;
    containerName: string;
    sasToken?: string;
  };
}

interface SettingsPanelProps {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onSettingsChange }) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [storageStats, setStorageStats] = useState<any>(null);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [cloudConfig, setCloudConfig] = useState({
    accountName: settings.azureConfig?.accountName || '',
    containerName: settings.azureConfig?.containerName || '',
    sasToken: settings.azureConfig?.sasToken || '',
  });

  // Load sync status and storage stats
  useEffect(() => {
    const loadStats = async () => {
      try {
        const stats = await syncQueueService.getStorageStats();
        setStorageStats(stats);
        
        const status = syncQueueService.getSyncStatus();
        setSyncStatus(status);
      } catch (error) {
        console.error('Failed to load stats:', error);
      }
    };

    loadStats();
    
    // Set up sync status listener
    syncQueueService.onStatusChange(setSyncStatus);
    
    // Refresh stats every 10 seconds
    const interval = setInterval(loadStats, 10000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Update cloud config when settings change
  useEffect(() => {
    if (settings.azureConfig) {
      setCloudConfig({
        accountName: settings.azureConfig.accountName || '',
        containerName: settings.azureConfig.containerName || '',
        sasToken: settings.azureConfig.sasToken || '',
      });
    }
  }, [settings.azureConfig]);

  const handleChange = (key: keyof Settings, value: any) => {
    onSettingsChange({
      ...settings,
      [key]: value
    });
  };

  const resetToDefaults = () => {
    onSettingsChange({
      confidenceThreshold: 0.5,
      humanDetection: true,
      motionDetection: true,
      notifications: true,
      cloudSync: false
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Settings</h2>
        <button
          onClick={resetToDefaults}
          className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset to Defaults</span>
        </button>
      </div>

      {/* Detection Settings */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Eye className="h-5 w-5 text-blue-400" />
          <h3 className="text-lg font-medium">Detection Settings</h3>
        </div>
        
        <div className="space-y-4">
          {/* Confidence Threshold */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Confidence Threshold: {(settings.confidenceThreshold * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={settings.confidenceThreshold}
              onChange={(e) => handleChange('confidenceThreshold', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>10% (More detections)</span>
              <span>100% (Only high confidence)</span>
            </div>
          </div>

          {/* Detection Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center space-x-3 p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-650 transition-colors">
              <input
                type="checkbox"
                checked={settings.humanDetection}
                onChange={(e) => handleChange('humanDetection', e.target.checked)}
                className="w-4 h-4 text-red-500 bg-gray-600 border-gray-500 rounded focus:ring-red-500"
              />
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-red-400" />
                <span className="font-medium">Human Detection</span>
              </div>
            </label>

            <label className="flex items-center space-x-3 p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-650 transition-colors">
              <input
                type="checkbox"
                checked={settings.motionDetection}
                onChange={(e) => handleChange('motionDetection', e.target.checked)}
                className="w-4 h-4 text-blue-500 bg-gray-600 border-gray-500 rounded focus:ring-blue-500"
              />
              <div className="flex items-center space-x-2">
                <Zap className="h-4 w-4 text-blue-400" />
                <span className="font-medium">Motion Detection</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Bell className="h-5 w-5 text-yellow-400" />
          <h3 className="text-lg font-medium">Notifications</h3>
        </div>
        
        <div className="space-y-4">
          <label className="flex items-center space-x-3 p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-650 transition-colors">
            <input
              type="checkbox"
              checked={settings.notifications}
              onChange={(e) => handleChange('notifications', e.target.checked)}
              className="w-4 h-4 text-yellow-500 bg-gray-600 border-gray-500 rounded focus:ring-yellow-500"
            />
            <div>
              <span className="font-medium">Push Notifications</span>
              <p className="text-sm text-gray-400">Get alerted when security events occur</p>
            </div>
          </label>

          {settings.notifications && (
            <div className="ml-7 pl-4 border-l-2 border-yellow-400 space-y-2">
              <p className="text-sm text-gray-400">Notification levels:</p>
              <div className="space-y-1 text-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span>Critical & High severity events</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                  <span>Medium & Low severity events (disabled)</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cloud Settings */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="h-5 w-5 text-purple-400">☁️</div>
            <h3 className="text-lg font-medium">Cloud Sync</h3>
          </div>
          
          {syncStatus && (
            <div className={`px-2 py-1 rounded text-xs font-medium ${
              syncStatus.isOnline ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
            }`}>
              {syncStatus.isOnline ? '🟢 Online' : '🔴 Offline'}
            </div>
          )}
        </div>
        
        {/* Cloud Sync Toggle */}
        <div className="space-y-4">
          <label className="flex items-center space-x-3 p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-650 transition-colors">
            <input
              type="checkbox"
              checked={settings.cloudSync}
              onChange={(e) => handleChange('cloudSync', e.target.checked)}
              className="w-4 h-4 text-purple-500 bg-gray-600 border-gray-500 rounded focus:ring-purple-500"
            />
            <div>
              <span className="font-medium">Auto-sync to Cloud</span>
              <p className="text-sm text-gray-400">Automatically backup events and images</p>
            </div>
          </label>

          {/* Storage Statistics */}
          {storageStats && (
            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="font-medium mb-3">Storage Statistics</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Local Events</p>
                  <p className="font-medium">{storageStats.local?.totalEvents || 0}</p>
                </div>
                <div>
                  <p className="text-gray-400">Unsynced</p>
                  <p className="font-medium text-yellow-400">{storageStats.local?.unsyncedEvents || 0}</p>
                </div>
                <div>
                  <p className="text-gray-400">Queue Length</p>
                  <p className="font-medium">{storageStats.local?.queueLength || 0}</p>
                </div>
                <div>
                  <p className="text-gray-400">Storage Used</p>
                  <p className="font-medium">
                    {storageStats.local?.storageUsed 
                      ? `${(storageStats.local.storageUsed / 1024 / 1024).toFixed(1)} MB`
                      : '0 MB'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Manual Sync Button */}
          {settings.cloudSync && (
            <div className="flex space-x-2">
              <button
                onClick={() => syncQueueService.syncNow()}
                disabled={syncStatus?.isSyncing}
                className="flex-1 bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {syncStatus?.isSyncing ? '🔄 Syncing...' : '🔄 Sync Now'}
              </button>
              
              <button
                onClick={() => syncQueueService.downloadFromCloud()}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
              >
                ⬇️ Download from Cloud
              </button>
            </div>
          )}

          {/* Azure Configuration */}
          {settings.cloudSync && (
            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="font-medium mb-3">Azure Blob Storage Configuration</h4>
              {settings.managedContainer ? (
                // Managed storage — server provisions & rotates SAS automatically
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                    <span>✓</span>
                    <span>Managed by privaseeAI</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Your dedicated storage container is provisioned and managed automatically.
                    Access tokens are rotated server-side on every session.
                  </p>
                  {settings.azureConfig?.accountName && (
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>Account: <span className="text-gray-300">{settings.azureConfig.accountName}</span></p>
                      <p>Container: <span className="text-gray-300">{settings.azureConfig.containerName}</span></p>
                    </div>
                  )}
                </div>
              ) : (
                // BYOS — manual configuration
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Storage Account Name
                    </label>
                    <input
                      type="text"
                      value={cloudConfig.accountName}
                      onChange={(e) => setCloudConfig(prev => ({ ...prev, accountName: e.target.value }))}
                      placeholder="mystorageaccount"
                      className="w-full bg-gray-600 text-white rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Container Name
                    </label>
                    <input
                      type="text"
                      value={cloudConfig.containerName}
                      onChange={(e) => setCloudConfig(prev => ({ ...prev, containerName: e.target.value }))}
                      placeholder="security-events"
                      className="w-full bg-gray-600 text-white rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      SAS Token
                    </label>
                    <input
                      type="password"
                      value={cloudConfig.sasToken}
                      onChange={(e) => setCloudConfig(prev => ({ ...prev, sasToken: e.target.value }))}
                      placeholder="sv=2022-11-02&ss=b&srt=sco&sp=rwdlacup&se=..."
                      className="w-full bg-gray-600 text-white rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      setIsConfiguring(true);
                      try {
                        console.log('🔧 Starting cloud sync configuration...');
                        console.log('Config:', cloudConfig);

                        const success = await syncQueueService.configureCloudSync(cloudConfig);
                        if (success) {
                          const updatedSettings = {
                            ...settings,
                            azureConfig: cloudConfig
                          };
                          onSettingsChange(updatedSettings);
                          alert('✅ Cloud sync configured successfully!');
                        } else {
                          console.error('❌ Cloud sync configuration failed');
                          alert('❌ Failed to configure cloud sync. Check the browser console for details.\n\nCommon issues:\n1. CORS not configured in Azure\n2. Container does not exist\n3. SAS token expired or wrong permissions');
                        }
                      } catch (error) {
                        console.error('❌ Cloud sync configuration error:', error);
                        alert('❌ Configuration error: ' + error);
                      } finally {
                        setIsConfiguring(false);
                      }
                    }}
                    disabled={isConfiguring || !cloudConfig.accountName || !cloudConfig.containerName || !cloudConfig.sasToken}
                    className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isConfiguring ? '⏳ Testing...' : '✅ Save & Test Configuration'}
                  </button>
                </div>
              )}
            </div>
          )}

          {!settings.cloudSync && (
            <div className="ml-7 pl-4 border-l-2 border-gray-600">
              <p className="text-sm text-gray-400">
                Enable cloud sync above to configure Azure Blob Storage
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Performance Settings */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-medium mb-4">Performance Info</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-gray-700 p-3 rounded">
            <p className="text-gray-400">Processing Rate</p>
            <p className="font-medium">5 FPS</p>
          </div>
          <div className="bg-gray-700 p-3 rounded">
            <p className="text-gray-400">ML Backend</p>
            <p className="font-medium">WebGL</p>
          </div>
          <div className="bg-gray-700 p-3 rounded">
            <p className="text-gray-400">Camera Resolution</p>
            <p className="font-medium">1280x720</p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button 
          onClick={() => {
            // Settings are already saved automatically via useEffect in App.tsx
            // This button provides user feedback
            alert('✅ Settings saved successfully!');
          }}
          className="flex items-center space-x-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg font-medium transition-colors"
        >
          <Save className="h-4 w-4" />
          <span>Settings Auto-Saved</span>
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;