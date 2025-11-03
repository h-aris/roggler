import React, { useState, useEffect } from 'react'
import usePoeApi from '../hooks/usePoeApi'
import AnalysisOverlay from './AnalysisOverlay'
import './MainAnalysisLegacy.css'

const MainAnalysisLegacy = ({ onAggregationOpen }) => {
  const [snapshotId, setSnapshotId] = useState('0955-20251103-36793')
  const [showCustomSnapshot, setShowCustomSnapshot] = useState(false)
  const [selectedRareItem, setSelectedRareItem] = useState('')
  const [messages, setMessages] = useState([])
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [selectedDimension, setSelectedDimension] = useState(null)
  const [dimensionResults, setDimensionResults] = useState(null)
  const [showOverlay, setShowOverlay] = useState(false)
  
  const { loading, error, currentData, dictionaries, fetchData } = usePoeApi()
  
  const rareItems = [
    "Rare Amulet", "Rare Belt", "Rare Body Armour", "Rare Boots", "Rare Bow", 
    "Rare Claw", "Rare Dagger", "Rare Gloves", "Rare Graft", "Rare Helmet", 
    "Rare Jewel", "Rare One Handed Axe", "Rare One Handed Mace", "Rare One Handed Sword", 
    "Rare Quiver", "Rare Ring", "Rare Shield", "Rare Staff", "Rare Two Handed Axe", 
    "Rare Two Handed Mace", "Rare Two Handed Sword", "Rare Wand"
  ]
  
  const addMessage = (message, type = 'info') => {
    setMessages(prev => [...prev, { 
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 
      message, 
      type, 
      timestamp: new Date().toLocaleTimeString() 
    }])
  }

  const selectRareItem = async (rareItem) => {
    setSelectedRareItem(rareItem)
    setShowAnalysis(false)
    setShowResults(false)
    setSelectedDimension(null)
    setDimensionResults(null)
    
    addMessage(`Selected: ${rareItem}. Starting analysis...`, 'info')
    
    try {
      localStorage.setItem('currentSnapshotId', snapshotId)
      await fetchData(snapshotId, rareItem)
      
      if (Object.keys(dictionaries).length > 0) {
        addMessage(`✅ Data fetched successfully! Found ${currentData?.result?.dimensions?.length || 0} dimensions`, 'success')
        setShowOverlay(true)
      } else {
        addMessage(`🚫 Analysis cannot proceed without dictionaries from the API.`, 'error')
        addMessage(`🔄 Try selecting ${rareItem} again in a few minutes.`, 'info')
      }
    } catch (err) {
      addMessage(`❌ Error: ${err.message}`, 'error')
    }
  }

  const analyzeDimension = (dimension) => {
    setSelectedDimension(dimension)
    
    // Find appropriate dictionary using dictionaryId like maintest.html
    let dictionaryId = dimension.dictionaryId
    const dictionary = dictionaries[dictionaryId]
    
    if (!dictionary) {
      addMessage(`❌ Dictionary "${dictionaryId}" not found. Available: ${Object.keys(dictionaries).join(', ')}`, 'error')
      return
    }

    addMessage(`🔍 Using dictionary "${dictionaryId}" with ${dictionary.values.length} values from ${dictionary.source}`, 'info')
    
    // Calculate true total like maintest.html
    const secondAscendancyDimension = currentData.result.dimensions.find(d => d.id === 'secondascendancy')
    const trueTotal = secondAscendancyDimension ? 
      secondAscendancyDimension.counts.reduce((sum, count) => sum + count.count, 0) : 
      currentData.result.total
    
    // Process data exactly like maintest.html
    const processedData = dimension.counts.map(count => {
      let name = dictionary.values[count.key] || `Key_${count.key}`
      
      return {
        key: count.key,
        name: name,
        count: count.count,
        percentage: ((count.count / trueTotal) * 100).toFixed(1),
        resolved: !!dictionary.values[count.key]
      }
    })
    
    // Apply attribute grouping for relevant dimensions
    let finalData = processedData
    if (dimension.id.startsWith('itembasetypes-')) {
      finalData = applyAttributeGrouping(processedData, dimension.id)
    }
    
    // Sort by count
    finalData.sort((a, b) => b.count - a.count)
    
    setDimensionResults({
      id: dimension.id,
      dictionaryId,
      total: trueTotal,
      data: finalData,
      dictionary
    })
    setShowResults(true)
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
    if (!dataCategory) return data
    
    const attributeGroups = {
      "Body Armour": {
        "Dex": ["Syndicate's Garb", "Astral Leather", "Supreme Leather", "Assassin's Garb", "Zodiac Leather", "Exquisite Leather", "Destiny Leather", "Sharkskin Tunic", "Cutthroat's Garb", "Coronal Leather", "Glorious Leather", "Frontier Leather", "Eelskin Tunic", "Thief's Garb", "Sun Leather", "Full Leather", "Wild Leather", "Buckskin Tunic", "Strapped Leather", "Shabby Jerkin"],
        "DexInt": ["Necrotic Armour", "Torturer Garb", "Sanguine Raiment", "Carnal Armour", "Sadist Garb", "Blood Raiment", "Varnished Coat", "Sentinel Jacket", "Crypt Armour", "Lacquered Garb", "Crimson Raiment", "Sleek Coat", "Quilted Jacket", "Bone Armour", "Waxed Garb", "Scarlet Raiment", "Oiled Coat", "Padded Jacket", "Oiled Vest", "Padded Vest"],
        "Int": ["Twilight Regalia", "Nightweave Robe", "Arcane Vestment", "Vaal Regalia", "Widowsilk Robe", "Occultist's Vestment", "Necromancer Silks", "Savant's Robe", "Destroyer Regalia", "Spidersilk Robe", "Conjurer's Vestment", "Silken Wrap", "Sage's Robe", "Cabalist Regalia", "Silk Robe", "Mage's Vestment", "Silken Garb", "Scholar's Robe", "Silken Vest", "Simple Robe"],
        "Str": ["Royal Plate", "Legion Plate", "Titan Plate", "Glorious Plate", "Gladiator Plate", "Astral Plate", "Crusader Plate", "Golden Plate", "Majestic Plate", "Colosseum Plate", "Sun Plate", "Battle Plate", "Bronze Plate", "Lordly Plate", "Arena Plate", "Full Plate", "War Plate", "Copper Plate", "Chestplate", "Plate Vest"],
        "StrDex": ["Conquest Lamellar", "Marshall's Brigandine", "Full Wyvernscale", "Triumphant Lamellar", "General's Brigandine", "Full Dragonscale", "Desert Brigandine", "Dragonscale Doublet", "Battle Lamellar", "Commander's Brigandine", "Full Wyrmscale", "Hussar Brigandine", "Wyrmscale Doublet", "Field Lamellar", "Soldier's Brigandine", "Full Scale Armour", "Infantry Brigandine", "Scale Doublet", "Light Brigandine", "Scale Vest"],
        "StrInt": ["Sacred Chainmail", "Paladin's Hauberk", "Grand Ringmail", "Saintly Chainmail", "Saint's Hauberk", "Elegant Ringmail", "Conquest Chainmail", "Loricated Ringmail", "Devout Chainmail", "Chain Hauberk", "Ornate Ringmail", "Crusader Chainmail", "Latticed Ringmail", "Holy Chainmail", "Full Chainmail", "Full Ringmail", "Chainmail Doublet", "Ringmail Coat", "Chainmail Tunic", "Chainmail Vest"]
      },
      "Boots": {
        "Dex": ["Velour Boots", "Stormrider Boots", "Harpyskin Boots", "Slink Boots", "Stealth Boots", "Shagreen Boots", "Windbreak Boots", "Sharkskin Boots", "Eelskin Boots", "Nubuck Boots", "Deerskin Boots", "Cloudwhisper Boots", "Goathide Boots", "Rawhide Boots"],
        "DexInt": ["Phantom Boots", "Infiltrator Boots", "Fugitive Boots", "Murder Boots", "Assassin's Boots", "Carnal Boots", "Ambush Boots", "Trapper Boots", "Shackled Boots", "Clasped Boots", "Strapped Boots", "Wrapped Boots"],
        "Int": ["Warlock Boots", "Dreamquest Slippers", "Sage Slippers", "Sorcerer Boots", "Arcanist Slippers", "Conjurer Boots", "Nightwind Slippers", "Samite Slippers", "Satin Slippers", "Scholar Boots", "Silk Slippers", "Duskwalk Slippers", "Velvet Slippers", "Wool Shoes"],
        "Str": ["Leviathan Greaves", "Brimstone Treads", "Precursor Greaves", "Titan Greaves", "Vaal Greaves", "Goliath Greaves", "Darksteel Treads", "Ancient Greaves", "Antique Greaves", "Reinforced Greaves", "Plated Greaves", "Basemetal Treads", "Steel Greaves", "Iron Greaves"],
        "StrDex": ["Wyvernscale Boots", "Chimerascale Boots", "Two-Toned Boots", "Dragonscale Boots", "Hydrascale Boots", "Wyrmscale Boots", "Serpentscale Boots", "Steelscale Boots", "Bronzescale Boots", "Ironscale Boots", "Leatherscale Boots"],
        "StrInt": ["Paladin Boots", "Martyr Boots", "Crusader Boots", "Legion Boots", "Soldier Boots", "Zealot Boots", "Riveted Boots", "Mesh Boots", "Ringmail Boots", "Chain Boots"]
      },
      "Gloves": {
        "Dex": ["Velour Gloves", "Harpyskin Gloves", "Trapsetter Gloves", "Slink Gloves", "Gripped Gloves", "Stealth Gloves", "Shagreen Gloves", "Sharkskin Gloves", "Apprentice Gloves", "Eelskin Gloves", "Nubuck Gloves", "Deerskin Gloves", "Tinker Gloves", "Goathide Gloves", "Rawhide Gloves"],
        "DexInt": ["Phantom Mitts", "Infiltrator Mitts", "Murder Mitts", "Assassin's Mitts", "Carnal Mitts", "Ambush Mitts", "Trapper Mitts", "Clasped Mitts", "Strapped Mitts", "Wrapped Mitts"],
        "Int": ["Warlock Gloves", "Sage Gloves", "Nexus Gloves", "Fingerless Silk Gloves", "Sorcerer Gloves", "Arcanist Gloves", "Conjurer Gloves", "Samite Gloves", "Satin Gloves", "Aetherwind Gloves", "Embroidered Gloves", "Silk Gloves", "Velvet Gloves", "Leyline Gloves", "Wool Gloves"],
        "Str": ["Leviathan Gauntlets", "Precursor Gauntlets", "Thwarting Gauntlets", "Spiked Gloves", "Titan Gauntlets", "Vaal Gauntlets", "Goliath Gauntlets", "Ancient Gauntlets", "Guarding Gauntlets", "Antique Gauntlets", "Steel Gauntlets", "Bronze Gauntlets", "Plated Gauntlets", "Preserving Gauntlets", "Iron Gauntlets"],
        "StrDex": ["Wyvernscale Gauntlets", "Chimerascale Gauntlets", "Dragonscale Gauntlets", "Hydrascale Gauntlets", "Wyrmscale Gauntlets", "Serpentscale Gauntlets", "Steelscale Gauntlets", "Bronzescale Gauntlets", "Ironscale Gauntlets", "Fishscale Gauntlets"],
        "StrInt": ["Paladin Gloves", "Martyr Gloves", "Apothecary's Gloves", "Crusader Gloves", "Legion Gloves", "Soldier Gloves", "Zealot Gloves", "Riveted Gloves", "Mesh Gloves", "Ringmail Gloves", "Chain Gloves"]
      },
      "Helmets": {
        "Dex": ["Majestic Pelt", "Grizzly Pelt", "Dire Pelt", "Lion Pelt", "Sinner Tricorne", "Silken Hood", "Ursine Pelt", "Noble Tricorne", "Hunter Hood", "Wolf Pelt", "Leather Hood", "Tricorne", "Leather Cap"],
        "DexInt": ["Torturer's Mask", "Ancient Mask", "Blizzard Crown", "Jester Mask", "Deicide Mask", "Vaal Mask", "Harlequin Mask", "Regicide Mask", "Winter Crown", "Callous Mask", "Raven Mask", "Golden Mask", "Festival Mask", "Iron Mask", "Gale Crown", "Plague Mask", "Scare Mask"],
        "Int": ["Lich's Circlet", "Sunfire Circlet", "Moonlit Circlet", "Hubris Circlet", "Mind Cage", "Solaris Circlet", "Necromancer Circlet", "Steel Circlet", "Lunaris Circlet", "Bone Circlet", "Tribal Circlet", "Torture Cage", "Iron Circlet", "Vine Circlet"],
        "Str": ["Giantslayer Helmet", "Conqueror's Helmet", "General's Helmet", "Eternal Burgonet", "Royal Burgonet", "Ezomyte Burgonet", "Samnite Helmet", "Siege Helmet", "Reaver Helmet", "Gladiator Helmet", "Close Helmet", "Barbute Helmet", "Cone Helmet", "Iron Hat"],
        "StrDex": ["Haunted Bascinet", "Conquest Helmet", "Penitent Mask", "Knight Helm", "Nightmare Bascinet", "Pig-Faced Bascinet", "Fluted Bascinet", "Lacquered Helmet", "Atonement Mask", "Fencer Helm", "Secutor Helm", "Gilded Sallet", "Visored Sallet", "Sorrow Mask", "Sallet", "Battered Helm"],
        "StrInt": ["Divine Crown", "Paladin Crown", "Archdemon Crown", "Faithful Helmet", "Bone Helmet", "Praetor Crown", "Prophet Crown", "Magistrate Crown", "Great Crown", "Demon Crown", "Zealot Helmet", "Aventail Helmet", "Crusader Helmet", "Great Helmet", "Imp Crown", "Soldier Helmet", "Rusted Coif"]
      },
      "Shield": {
        "Dex": ["Imperial Buckler", "Crusader Buckler", "Vaal Buckler", "Lacquered Buckler", "Ironwood Buckler", "Golden Buckler", "Battle Buckler", "Corrugated Buckler", "Enameled Buckler", "Oak Buckler", "Gilded Buckler", "War Buckler", "Hammered Buckler", "Painted Buckler", "Pine Buckler", "Goathide Buckler"],
        "DexInt": ["Supreme Spiked Shield", "Mirrored Spiked Shield", "Ezomyte Spiked Shield", "Alder Spiked Shield", "Sovereign Spiked Shield", "Polished Spiked Shield", "Compound Spiked Shield", "Redwood Spiked Shield", "Ornate Spiked Shield", "Burnished Spiked Shield", "Alloyed Spiked Shield", "Driftwood Spiked Shield", "Spiked Bundle"],
        "Int": ["Titanium Spirit Shield", "Harmonic Spirit Shield", "Vaal Spirit Shield", "Lacewood Spirit Shield", "Thorium Spirit Shield", "Chiming Spirit Shield", "Fossilised Spirit Shield", "Ivory Spirit Shield", "Bone Spirit Shield", "Ancient Spirit Shield", "Walnut Spirit Shield", "Brass Spirit Shield", "Jingling Spirit Shield", "Tarnished Spirit Shield", "Yew Spirit Shield", "Twig Spirit Shield"],
        "Str": ["Pinnacle Tower Shield", "Colossal Tower Shield", "Ezomyte Tower Shield", "Ebony Tower Shield", "Shagreen Tower Shield", "Crested Tower Shield", "Girded Tower Shield", "Bronze Tower Shield", "Mahogany Tower Shield", "Buckskin Tower Shield", "Painted Tower Shield", "Reinforced Tower Shield", "Copper Tower Shield", "Cedar Tower Shield", "Rawhide Tower Shield", "Corroded Tower Shield", "Splintered Tower Shield"],
        "StrDex": ["Elegant Round Shield", "Cardinal Round Shield", "Spiny Round Shield", "Teak Round Shield", "Baroque Round Shield", "Crimson Round Shield", "Spiked Round Shield", "Maple Round Shield", "Splendid Round Shield", "Scarlet Round Shield", "Studded Round Shield", "Fir Round Shield", "Rotted Round Shield"],
        "StrInt": ["Archon Kite Shield", "Mosaic Kite Shield", "Champion Kite Shield", "Branded Kite Shield", "Angelic Kite Shield", "Laminated Kite Shield", "Steel Kite Shield", "Etched Kite Shield", "Ceremonial Kite Shield", "Layered Kite Shield", "Reinforced Kite Shield", "Linden Kite Shield", "Plank Kite Shield"]
      }
    }
    
    const groups = attributeGroups[dataCategory]
    if (!groups) return data
    
    const groupedItems = []
    const ungroupedItems = [...data]
    
    Object.keys(groups).forEach(attribute => {
      const attributeItems = groups[attribute]
      const matchedItems = []
      let totalCount = 0
      let totalPercentage = 0
      
      attributeItems.forEach(itemName => {
        const itemIndex = ungroupedItems.findIndex(item => item.name === itemName)
        if (itemIndex !== -1) {
          const item = ungroupedItems[itemIndex]
          matchedItems.push(item)
          totalCount += item.count
          totalPercentage += parseFloat(item.percentage)
          ungroupedItems.splice(itemIndex, 1)
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

  // Calculate stats
  const getStats = () => {
    if (!currentData) return null
    
    const secondAscendancyDimension = currentData.result.dimensions?.find(d => d.id === 'secondascendancy')
    const trueTotal = secondAscendancyDimension ? 
      secondAscendancyDimension.counts.reduce((sum, count) => sum + count.count, 0) : 
      currentData.result.total

    return {
      trueTotal,
      apiTotal: currentData.result.total,
      dimensions: currentData.result.dimensions?.length || 0,
      dictionaries: Object.keys(dictionaries).length
    }
  }

  // Get target dimensions
  const getTargetDimensions = () => {
    if (!currentData?.result?.dimensions) return []
    
    return currentData.result.dimensions.filter(d => {
      return d.id === 'skills' || 
             d.id.startsWith('itembasetypes') || 
             d.id.startsWith('itemmods')
    })
  }

  const stats = getStats()
  const targetDimensions = getTargetDimensions()

  return (
    <div className="main-analysis-legacy">
      {/* Snapshot ID Input */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">POE.ninja Advanced Analysis</h2>
        </div>
        
        <div className="form-group">
          <label className="form-label">Snapshot ID</label>
          <select 
            className="form-input"
            value={snapshotId}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setShowCustomSnapshot(true)
              } else {
                setSnapshotId(e.target.value)
              }
            }}
          >
            <option value="0955-20251103-36793">Latest (Nov 3, 2025)</option>
            <option value="2006-20251102-24503">Previous (Nov 2, 2025)</option>
            <option value="custom">Custom...</option>
          </select>
        </div>
      </div>

      {/* Rare Items Grid */}
      <div className="rare-items-section">
        <h3>Select Rare Item Type</h3>
        <div className="rare-items-grid">
          {rareItems.map(rareItem => (
            <div
              key={rareItem}
              className={`rare-item-button ${selectedRareItem === rareItem ? 'selected' : ''} ${loading ? 'disabled' : ''}`}
              onClick={() => !loading && selectRareItem(rareItem)}
            >
              {rareItem}
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-subtitle">Analysis Log</h3>
          </div>
          <div className="messages-container">
            {messages.slice(-10).map(msg => (
              <div key={msg.id} className={`message ${msg.type}`}>
                [{msg.timestamp}] {msg.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis Section */}
      {showAnalysis && stats && (
        <div className="analysis-section active">
          <h3>Analysis: {selectedRareItem}</h3>
          
          {/* Stats */}
          <div className="analysis-stats">
            <div className="stat-box">
              <div className="stat-number">{stats.trueTotal}</div>
              <div className="stat-label">True Total</div>
            </div>
            <div className="stat-box">
              <div className="stat-number">{stats.apiTotal}</div>
              <div className="stat-label">API Total</div>
            </div>
            <div className="stat-box">
              <div className="stat-number">{stats.dimensions}</div>
              <div className="stat-label">Dimensions</div>
            </div>
            <div className="stat-box">
              <div className="stat-number">{stats.dictionaries}</div>
              <div className="stat-label">Dictionaries</div>
            </div>
          </div>
          
          {/* Dimension Buttons */}
          <div className="dimension-buttons">
            {targetDimensions.map(dimension => (
              <button
                key={dimension.id}
                className={`dimension-button ${selectedDimension?.id === dimension.id ? 'active' : ''}`}
                onClick={() => analyzeDimension(dimension)}
              >
                {dimension.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results Section */}
      {showResults && dimensionResults && (
        <div className="results-section active">
          <h3>{selectedDimension.id} - Top 50 Results</h3>
          
          {/* Results Stats */}
          <div className="results-stats">
            <div className="stat-box">
              <div className="stat-number">{dimensionResults.data.length}</div>
              <div className="stat-label">Total Items</div>
            </div>
            <div className="stat-box">
              <div className="stat-number">{dimensionResults.data.filter(item => item.resolved).length}</div>
              <div className="stat-label">Resolved</div>
            </div>
            <div className="stat-box">
              <div className="stat-number">{dimensionResults.data.filter(item => !item.resolved).length}</div>
              <div className="stat-label">Unresolved</div>
            </div>
            <div className="stat-box">
              <div className="stat-number">{dimensionResults.dictionary.source}</div>
              <div className="stat-label">Dict Source</div>
            </div>
          </div>
          
          {/* Results List */}
          <div className="results-list">
            {dimensionResults.data.slice(0, 50).map((item, index) => (
              <div 
                key={item.isGroup ? item.groupKey : index}
                className={`result-item ${item.isGroup ? 'clickable-group' : ''} ${!item.resolved ? 'unresolved' : ''}`}
                onClick={() => item.isGroup && handleGroupClick(item)}
              >
                <span 
                  className="result-name"
                  style={{ 
                    color: item.resolved ? '#e0e0e0' : '#ff6b6b',
                    fontWeight: item.isGroup ? 'bold' : 'normal',
                    cursor: item.isGroup ? 'pointer' : 'default'
                  }}
                >
                  {item.name}
                </span>
                <span className="result-count">{item.count}</span>
                <span className="result-percentage">{item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Snapshot Modal */}
      {showCustomSnapshot && (
        <div className="analysis-overlay">
          <div className="overlay-backdrop" onClick={() => setShowCustomSnapshot(false)} />
          <div className="custom-snapshot-modal">
            <div className="modal-header">
              <h3>Enter Custom Snapshot ID</h3>
              <button className="overlay-close" onClick={() => setShowCustomSnapshot(false)}>×</button>
            </div>
            <div className="modal-content">
              <input
                type="text"
                className="form-input"
                placeholder="e.g., 0955-20251103-36793"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSnapshotId(e.target.value)
                    setShowCustomSnapshot(false)
                  }
                  if (e.key === 'Escape') {
                    setShowCustomSnapshot(false)
                  }
                }}
              />
              <div className="modal-buttons">
                <button 
                  className="btn-secondary" 
                  onClick={() => setShowCustomSnapshot(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary"
                  onClick={(e) => {
                    const input = e.target.parentElement.previousElementSibling
                    setSnapshotId(input.value)
                    setShowCustomSnapshot(false)
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Overlay */}
      <AnalysisOverlay
        isOpen={showOverlay}
        onClose={() => setShowOverlay(false)}
        rareItem={selectedRareItem}
        snapshotId={snapshotId}
        initialData={currentData}
        dictionaries={dictionaries}
      />
    </div>
  )
}

export default MainAnalysisLegacy