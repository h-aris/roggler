import React, { useState } from 'react'
import './App.css'
import Sidebar from './components/Sidebar'
import MainAnalysisLegacy from './components/MainAnalysisLegacy'
import AggregationPanel from './components/AggregationPanel'

function App() {
  const [aggregationData, setAggregationData] = useState(null)
  const [isAggregationOpen, setIsAggregationOpen] = useState(false)

  return (
    <div className="app">
      <div className="app-container">
        <Sidebar />
        
        <div className="main-content">
          <div className="analysis-container">
            <MainAnalysisLegacy 
              onAggregationOpen={(data) => {
                setAggregationData(data)
                setIsAggregationOpen(true)
              }}
            />
            
            {isAggregationOpen && (
              <AggregationPanel 
                data={aggregationData}
                onClose={() => setIsAggregationOpen(false)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App