import React, { useState } from 'react'
import usePoeApi from '../hooks/usePoeApi'
import DimensionsView from './DimensionsView'

const MainAnalysis = ({ onAggregationOpen }) => {
  const [snapshotId, setSnapshotId] = useState('2006-20251102-24503')
  const [selectedRareItem, setSelectedRareItem] = useState('')
  const [messages, setMessages] = useState([])
  
  const { loading, error, currentData, dictionaries, fetchData } = usePoeApi()
  
  const addMessage = (message, type = 'info') => {
    setMessages(prev => [...prev, { 
      id: Date.now(), 
      message, 
      type, 
      timestamp: new Date().toLocaleTimeString() 
    }])
  }

  const handleAnalyze = async () => {
    if (!selectedRareItem) {
      addMessage('Please select a rare item type', 'error')
      return
    }
    
    try {
      addMessage(`Selected: ${selectedRareItem}. Starting analysis...`, 'info')
      // Store snapshot ID for aggregation panel
      localStorage.setItem('currentSnapshotId', snapshotId)
      await fetchData(snapshotId, selectedRareItem)
      addMessage(`✅ Data fetched successfully! Found ${currentData?.result?.dimensions?.length || 0} dimensions`, 'success')
    } catch (err) {
      addMessage(`❌ Error: ${err.message}`, 'error')
    }
  }

  const rareItems = [
    'Rare Amulet', 'Rare Belt', 'Rare Body Armour', 'Rare Boots', 'Rare Bow',
    'Rare Claw', 'Rare Dagger', 'Rare Gloves', 'Rare Helmet', 'Rare Jewel',
    'Rare One Hand Axe', 'Rare One Hand Mace', 'Rare One Hand Sword', 'Rare Quiver',
    'Rare Ring', 'Rare Rune Dagger', 'Rare Sceptre', 'Rare Shield', 'Rare Staff',
    'Rare Thrusting One Hand Sword', 'Rare Two Hand Axe', 'Rare Two Hand Mace', 
    'Rare Two Hand Sword', 'Rare Wand'
  ]

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Header */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">POE.ninja Advanced Analysis</h2>
        </div>
        
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Snapshot ID</label>
            <input 
              type="text"
              className="form-input"
              value={snapshotId}
              onChange={(e) => setSnapshotId(e.target.value)}
              placeholder="e.g., 2006-20251102-24503"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Rare Item Type</label>
            <select 
              className="form-select"
              value={selectedRareItem}
              onChange={(e) => setSelectedRareItem(e.target.value)}
            >
              <option value="">Select rare item type</option>
              {rareItems.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
        
        <button 
          className={`btn btn-primary btn-full ${loading ? 'btn-loading' : ''}`}
          onClick={handleAnalyze}
          disabled={loading}
        >
          {loading ? 'Analyzing...' : 'Analyze Data'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-subtitle">Analysis Log</h3>
          </div>
          <div className="scrollable">
            {messages.slice(-10).map(msg => (
              <div key={msg.id} className="flex items-center gap-3 mb-2">
                <span className={`badge badge-${msg.type === 'error' ? 'red' : msg.type === 'success' ? 'green' : 'blue'}`}>
                  {msg.timestamp}
                </span>
                <span className="text-sm" style={{ flex: 1 }}>{msg.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Summary */}
      {currentData && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-subtitle">Data Summary</h3>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span>Total Results:</span>
              <span className="badge badge-blue" style={{ fontSize: '14px' }}>
                {currentData.result.total}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Dimensions:</span>
              <span className="badge badge-green" style={{ fontSize: '14px' }}>
                {currentData.result.dimensions?.length || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Dictionaries Loaded:</span>
              <span className="badge badge-purple" style={{ fontSize: '14px' }}>
                {Object.keys(dictionaries).length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Dimensions Analysis */}
      <DimensionsView 
        currentData={currentData}
        dictionaries={dictionaries}
        onAggregationOpen={onAggregationOpen}
      />
    </div>
  )
}

export default MainAnalysis