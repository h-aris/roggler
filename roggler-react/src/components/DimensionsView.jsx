import React, { useState, useEffect } from 'react'
import usePoeApi from '../hooks/usePoeApi'
import './DimensionsView.css'

const DimensionsView = ({ currentData, dictionaries, onAggregationOpen }) => {
  const [processedDimensions, setProcessedDimensions] = useState([])
  const [selectedDimension, setSelectedDimension] = useState('')
  const [dimensionData, setDimensionData] = useState(null)
  const [error, setError] = useState(null)
  const { processDimension } = usePoeApi()

  // Process available dimensions
  useEffect(() => {
    try {
      setError(null)
      if (currentData?.result?.dimensions && dictionaries) {
        const processed = currentData.result.dimensions
          .filter(dim => dim && dim.id) // Filter out invalid dimensions
          .map(dim => {
            const hasDict = dictionaries[dim.id]
            return {
              id: dim.id,
              total: typeof dim.total === 'number' ? dim.total : 0,
              hasDict,
              displayName: formatDimensionName(dim.id)
            }
          }).sort((a, b) => {
            // Sort by having dictionary first, then by name
            if (a.hasDict && !b.hasDict) return -1
            if (!a.hasDict && b.hasDict) return 1
            return a.displayName.localeCompare(b.displayName)
          })
        setProcessedDimensions(processed)
      }
    } catch (err) {
      console.error('Error processing dimensions:', err)
      setError('Failed to process dimensions data')
    }
  }, [currentData, dictionaries])

  const formatDimensionName = (id) => {
    return id.replace(/([A-Z])/g, ' $1')
             .replace(/^./, str => str.toUpperCase())
             .replace('itembasetypes-', 'Item Types: ')
             .replace('itemmods-', 'Mods: ')
             .replace('skills-', 'Skills: ')
  }

  const handleDimensionSelect = (dimensionId) => {
    setSelectedDimension(dimensionId)
    const dimension = currentData.result.dimensions.find(d => d.id === dimensionId)
    if (dimension && dictionaries[dimensionId]) {
      const processed = processDimension(dimension, dictionaries)
      setDimensionData(processed)
    }
  }

  const getAttributeGroups = () => {
    // Load basetypes data for grouping
    const attributeGroups = {
      "Body Armour": {
        "Dex": ["Syndicate's Garb", "Astral Leather", "Supreme Leather", "Assassin's Garb", "Zodiac Leather"],
        "DexInt": ["Necrotic Armour", "Torturer Garb", "Sanguine Raiment", "Carnal Armour", "Sadist Garb"],
        "Int": ["Twilight Regalia", "Nightweave Robe", "Arcane Vestment", "Vaal Regalia", "Widowsilk Robe"],
        "Str": ["Royal Plate", "Legion Plate", "Titan Plate", "Glorious Plate", "Gladiator Plate"],
        "StrDex": ["Conquest Lamellar", "Marshall's Brigandine", "Full Wyvernscale", "Triumphant Lamellar"],
        "StrInt": ["Sacred Chainmail", "Paladin's Hauberk", "Grand Ringmail", "Saintly Chainmail"]
      },
      "Boots": {
        "Dex": ["Velour Boots", "Stormrider Boots", "Harpyskin Boots", "Slink Boots"],
        "DexInt": ["Phantom Boots", "Infiltrator Boots", "Fugitive Boots", "Murder Boots"],
        "Int": ["Warlock Boots", "Dreamquest Slippers", "Sage Slippers", "Sorcerer Boots"],
        "Str": ["Leviathan Greaves", "Brimstone Treads", "Precursor Greaves", "Titan Greaves"],
        "StrDex": ["Wyvernscale Boots", "Chimerascale Boots", "Two-Toned Boots", "Dragonscale Boots"],
        "StrInt": ["Paladin Boots", "Martyr Boots", "Crusader Boots", "Legion Boots"]
      },
      "Gloves": {
        "Dex": ["Velour Gloves", "Harpyskin Gloves", "Trapsetter Gloves", "Slink Gloves"],
        "DexInt": ["Phantom Mitts", "Infiltrator Mitts", "Murder Mitts", "Assassin's Mitts"],
        "Int": ["Warlock Gloves", "Sage Gloves", "Nexus Gloves", "Fingerless Silk Gloves"],
        "Str": ["Leviathan Gauntlets", "Precursor Gauntlets", "Thwarting Gauntlets", "Spiked Gloves"],
        "StrDex": ["Wyvernscale Gauntlets", "Chimerascale Gauntlets", "Dragonscale Gauntlets"],
        "StrInt": ["Paladin Gloves", "Martyr Gloves", "Apothecary's Gloves", "Crusader Gloves"]
      },
      "Helmets": {
        "Dex": ["Majestic Pelt", "Grizzly Pelt", "Dire Pelt", "Lion Pelt"],
        "DexInt": ["Torturer's Mask", "Ancient Mask", "Blizzard Crown", "Jester Mask"],
        "Int": ["Lich's Circlet", "Sunfire Circlet", "Moonlit Circlet", "Hubris Circlet"],
        "Str": ["Giantslayer Helmet", "Conqueror's Helmet", "General's Helmet", "Eternal Burgonet"],
        "StrDex": ["Haunted Bascinet", "Conquest Helmet", "Penitent Mask", "Knight Helm"],
        "StrInt": ["Divine Crown", "Paladin Crown", "Archdemon Crown", "Faithful Helmet"]
      },
      "Shield": {
        "Dex": ["Imperial Buckler", "Crusader Buckler", "Vaal Buckler", "Lacquered Buckler"],
        "DexInt": ["Supreme Spiked Shield", "Mirrored Spiked Shield", "Ezomyte Spiked Shield"],
        "Int": ["Titanium Spirit Shield", "Harmonic Spirit Shield", "Vaal Spirit Shield"],
        "Str": ["Pinnacle Tower Shield", "Colossal Tower Shield", "Ezomyte Tower Shield"],
        "StrDex": ["Elegant Round Shield", "Cardinal Round Shield", "Spiny Round Shield"],
        "StrInt": ["Archon Kite Shield", "Mosaic Kite Shield", "Champion Kite Shield"]
      }
    }
    return attributeGroups
  }

  const applyAttributeGrouping = (data, dimensionId) => {
    const category = dimensionId.replace('itembasetypes-', '')
    const categoryMap = {
      'BodyArmour': 'Body Armour',
      'Boots': 'Boots',
      'Gloves': 'Gloves', 
      'Helmet': 'Helmets',
      'Shield': 'Shield'
    }
    
    const dataCategory = categoryMap[category]
    if (!dataCategory) {
      return data // No grouping for this category
    }
    
    const attributeGroups = getAttributeGroups()
    const groups = attributeGroups[dataCategory]
    if (!groups) return data
    
    const groupedItems = []
    const ungroupedItems = [...data]
    
    // Create groups for each attribute
    Object.keys(groups).forEach(attribute => {
      const attributeItems = groups[attribute]
      const matchedItems = []
      let totalCount = 0
      let totalPercentage = 0
      
      // Find matching items in the data
      attributeItems.forEach(itemName => {
        const itemIndex = ungroupedItems.findIndex(item => item.name === itemName)
        if (itemIndex !== -1) {
          const item = ungroupedItems[itemIndex]
          matchedItems.push(item)
          totalCount += item.count
          totalPercentage += parseFloat(item.percentage)
          ungroupedItems.splice(itemIndex, 1) // Remove from ungrouped
        }
      })
      
      if (matchedItems.length > 0) {
        const group = {
          name: `${attribute} ${category} (${matchedItems.length} types)`,
          count: totalCount,
          percentage: totalPercentage.toFixed(1),
          resolved: true,
          isGroup: true,
          groupKey: `group_${attribute.toLowerCase()}_${category.toLowerCase()}`,
          groupItems: matchedItems,
          attribute,
          category
        }
        groupedItems.push(group)
      }
    })
    
    // Add ungrouped items at the end
    return [...groupedItems, ...ungroupedItems]
  }

  const handleGroupClick = (group) => {
    if (group.isGroup) {
      onAggregationOpen({
        groupName: group.name,
        attribute: group.attribute,
        category: group.category,
        items: group.groupItems
      })
    }
  }

  if (!currentData || !dictionaries) {
    return (
      <div className="dimensions-view">
        <div className="card">
          <div className="card-header">
            <h3 className="card-subtitle">Analysis Results</h3>
          </div>
          <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>
            No data available. Please analyze a rare item first.
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dimensions-view">
        <div className="card">
          <div className="alert alert-error">
            {error}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dimensions-view">
      {/* Dimensions List */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-subtitle">Available Dimensions</h3>
          <div className="text-sm text-gray-400">
            {processedDimensions.length} dimensions available
          </div>
        </div>
        
        <div className="dimensions-grid">
          {processedDimensions.map(dim => (
            <button
              key={dim.id}
              className={`dimension-card ${selectedDimension === dim.id ? 'active' : ''} ${!dim.hasDict ? 'disabled' : ''}`}
              onClick={() => dim.hasDict && handleDimensionSelect(dim.id)}
              disabled={!dim.hasDict}
            >
              <div className="dimension-name">{dim.displayName}</div>
              <div className="dimension-meta">
                <span className="dimension-total">{(dim.total || 0).toLocaleString()} total</span>
                {dim.hasDict ? (
                  <span className="badge badge-green">Ready</span>
                ) : (
                  <span className="badge badge-red">No Dict</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Selected Dimension Data */}
      {dimensionData && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-subtitle">{formatDimensionName(selectedDimension)}</h3>
            <div className="text-sm text-gray-400">
              {dimensionData.data.length} items • {dimensionData.total.toLocaleString()} total
            </div>
          </div>
          
          <div className="dimension-results">
            {(() => {
              const processedData = selectedDimension.startsWith('itembasetypes-') 
                ? applyAttributeGrouping(dimensionData.data, selectedDimension)
                : dimensionData.data
              
              return processedData.map((item, index) => (
                <div 
                  key={item.isGroup ? item.groupKey : index} 
                  className={`result-item ${item.isGroup ? 'group-item' : ''} ${!item.resolved ? 'unresolved' : ''}`}
                  onClick={() => item.isGroup && handleGroupClick(item)}
                  style={{ cursor: item.isGroup ? 'pointer' : 'default' }}
                >
                  <div className="result-name">
                    {item.name}
                    {item.isGroup && (
                      <div className="group-details">
                        {item.groupItems.map(gItem => `${gItem.name}: ${gItem.count}`).join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="result-stats">
                    <span className="result-count">{item.count.toLocaleString()}</span>
                    <span className="result-percentage">{item.percentage}%</span>
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

export default DimensionsView