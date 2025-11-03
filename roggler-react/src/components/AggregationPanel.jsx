import React, { useState, useEffect } from 'react'
import usePoeApi from '../hooks/usePoeApi'

const AggregationPanel = ({ data, onClose }) => {
  const [aggregationResults, setAggregationResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { aggregateBasetypes } = usePoeApi()

  useEffect(() => {
    if (data) {
      performAggregation()
    }
  }, [data])

  const performAggregation = async () => {
    if (!data) return

    setLoading(true)
    setError(null)

    try {
      // Get current snapshot ID from localStorage or URL
      const snapshotId = localStorage.getItem('currentSnapshotId') || '2006-20251102-24503'
      
      // Extract basetypes from the grouped items
      const basetypes = data.items.map(item => item.name)
      
      const results = await aggregateBasetypes(snapshotId, data.category, data.attribute, basetypes)
      
      if (results.results.length > 0) {
        const aggregated = processAggregatedData(results.results)
        setAggregationResults({
          ...aggregated,
          errors: results.errors,
          skipped: results.skipped
        })
      } else {
        setError('No data could be aggregated')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const processAggregatedData = (results) => {
    const totalBuilds = results.reduce((sum, result) => sum + result.trueTotal, 0)
    const itemmodsAggregated = {}
    const skillsAggregated = {}
    const basetypeDistribution = results.map(result => ({
      name: result.basetype,
      count: result.trueTotal,
      percentage: ((result.trueTotal / totalBuilds) * 100).toFixed(1)
    }))

    // Process each result like maintest.html
    for (const result of results) {
      // Load dictionaries for this result
      const dictionaries = {}
      if (result.data.result.dictionaries) {
        for (const dictRef of result.data.result.dictionaries) {
          // Note: dictionaries should be loaded in aggregateBasetypes
          // For now, we'll need to access them from the result data
        }
      }

      // Process itemmods dimensions - track modifiers per basetype to avoid duplicates
      const itemmodsDimensions = result.data.result.dimensions?.filter(d => d.id.startsWith('itemmods')) || []
      const seenModifiers = new Map() // Track highest count for each modifier name
      
      for (const dimension of itemmodsDimensions) {
        // Get dictionary - this needs to be fixed to load dictionaries properly
        const dictionary = result.dictionaries?.[dimension.dictionaryId]
        if (!dictionary) continue
        
        dimension.counts.forEach(count => {
          const name = dictionary.values[count.key] || `Key_${count.key}`
          
          // Only use the highest count for this modifier (in case it appears in multiple dimensions)
          if (!seenModifiers.has(name) || count.count > seenModifiers.get(name).count) {
            seenModifiers.set(name, count)
          }
        })
      }
      
      // Add the deduplicated modifiers to aggregated results
      seenModifiers.forEach((count, name) => {
        const percentage = (count.count / result.trueTotal) * 100
        
        if (!itemmodsAggregated[name]) {
          itemmodsAggregated[name] = { totalCount: 0, basetypes: [] }
        }
        
        itemmodsAggregated[name].totalCount += count.count
        itemmodsAggregated[name].basetypes.push(`${result.basetype}: ${percentage.toFixed(1)}%`)
      })
      
      // Process skills dimension
      const skillsDimension = result.data.result.dimensions?.find(d => d.id === 'skills')
      if (skillsDimension) {
        const dictionary = result.dictionaries?.[skillsDimension.dictionaryId]
        if (dictionary) {
          skillsDimension.counts.forEach(count => {
            const name = dictionary.values[count.key] || `Key_${count.key}`
            const percentage = (count.count / result.trueTotal) * 100
            
            if (!skillsAggregated[name]) {
              skillsAggregated[name] = { totalCount: 0, basetypes: [] }
            }
            
            skillsAggregated[name].totalCount += count.count
            skillsAggregated[name].basetypes.push(`${result.basetype}: ${percentage.toFixed(1)}%`)
          })
        }
      }
    }

    // Display itemmods results - calculate percentage based on total builds
    const itemmodsArray = Object.entries(itemmodsAggregated)
      .map(([name, data]) => ({ 
        name, 
        percentage: (data.totalCount / totalBuilds) * 100, 
        count: data.totalCount, 
        basetypes: data.basetypes 
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 50)

    // Display skills results - calculate percentage based on total builds
    const skillsArray = Object.entries(skillsAggregated)
      .map(([name, data]) => ({ 
        name, 
        percentage: (data.totalCount / totalBuilds) * 100, 
        count: data.totalCount, 
        basetypes: data.basetypes 
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 50)

    return {
      totalBuilds,
      itemMods: itemmodsArray,
      skills: skillsArray,
      basetypeDistribution
    }
  }

  if (!data) return null

  return (
    <div style={{ 
      width: '600px', 
      background: '#0a0a0a', 
      border: '2px solid #2a2a2a',
      borderRadius: '8px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      maxHeight: '80vh',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="card-subtitle">{data.groupName}</h3>
          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
            {loading ? 'Aggregating data...' : aggregationResults ? `${aggregationResults.totalBuilds} total builds` : 'Ready to aggregate'}
          </div>
        </div>
        <button 
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '4px'
          }}
        >
          ×
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>
          <div>Loading aggregated data...</div>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {aggregationResults && (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '16px',
          overflowY: 'auto',
          flex: 1
        }}>
          {/* Basetype Distribution */}
          <div className="card" style={{ margin: 0 }}>
            <div className="card-header">
              <h4 className="card-subtitle">Basetype Distribution</h4>
            </div>
            <div className="scrollable" style={{ maxHeight: '120px' }}>
              {aggregationResults.basetypeDistribution.map((basetype, index) => (
                <div key={index} className="flex justify-between items-center mb-2">
                  <span className="text-sm">{basetype.name}</span>
                  <div className="flex gap-2">
                    <span className="badge badge-blue">{basetype.count}</span>
                    <span className="text-sm text-gray-400">{basetype.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Item Mods */}
          <div className="card" style={{ margin: 0 }}>
            <div className="card-header">
              <h4 className="card-subtitle">Item Modifiers</h4>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                {aggregationResults.itemMods.length} unique modifiers
              </div>
            </div>
            <div className="scrollable" style={{ maxHeight: '200px' }}>
              {aggregationResults.itemMods.slice(0, 20).map((mod, index) => (
                <div key={index} className="flex justify-between items-center mb-2">
                  <span className="text-sm">{mod.name}</span>
                  <div className="flex gap-2">
                    <span className="badge badge-green">{mod.count}</span>
                    <span className="text-sm text-gray-400">{mod.percentage.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Skills */}
          <div className="card" style={{ margin: 0 }}>
            <div className="card-header">
              <h4 className="card-subtitle">Skills</h4>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                {aggregationResults.skills.length} unique skills
              </div>
            </div>
            <div className="scrollable" style={{ maxHeight: '200px' }}>
              {aggregationResults.skills.slice(0, 20).map((skill, index) => (
                <div key={index} className="flex justify-between items-center mb-2">
                  <span className="text-sm">{skill.name}</span>
                  <div className="flex gap-2">
                    <span className="badge badge-purple">{skill.count}</span>
                    <span className="text-sm text-gray-400">{skill.percentage.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Errors and Skipped */}
          {(aggregationResults.errors.length > 0 || aggregationResults.skipped.length > 0) && (
            <div className="card" style={{ margin: 0 }}>
              <div className="card-header">
                <h4 className="card-subtitle">Processing Notes</h4>
              </div>
              {aggregationResults.skipped.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ color: '#f59e0b', fontSize: '12px' }}>
                    Skipped: {aggregationResults.skipped.join(', ')}
                  </span>
                </div>
              )}
              {aggregationResults.errors.length > 0 && (
                <div>
                  <span style={{ color: '#ef4444', fontSize: '12px' }}>
                    Errors: {aggregationResults.errors.map(e => e.basetype).join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AggregationPanel