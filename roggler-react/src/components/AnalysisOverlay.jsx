import React, { useState, useEffect } from 'react'
import usePoeApi from '../hooks/usePoeApi'
import './AnalysisOverlay.css'

const AnalysisOverlay = ({ isOpen, onClose, rareItem, snapshotId, initialData, dictionaries }) => {
  const [analysisData, setAnalysisData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [aggregationData, setAggregationData] = useState(null)
  const [aggregationLoading, setAggregationLoading] = useState(false)
  const [currentAggregationCall, setCurrentAggregationCall] = useState('')
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [skillFilteredData, setSkillFilteredData] = useState(null)
  const [isSkillFiltered, setIsSkillFiltered] = useState(false)
  const [aggregationProgress, setAggregationProgress] = useState({ current: 0, total: 0 })
  const { aggregateBasetypes, fetchSkillFilteredData } = usePoeApi()

  useEffect(() => {
    if (isOpen && initialData && dictionaries) {
      processInitialData()
    }
  }, [isOpen, initialData, dictionaries])

  const processInitialData = () => {
    setLoading(true)
    
    try {
      // Calculate true total
      const secondAscendancyDimension = initialData.result.dimensions?.find(d => d.id === 'secondascendancy')
      const trueTotal = secondAscendancyDimension ? 
        secondAscendancyDimension.counts.reduce((sum, count) => sum + count.count, 0) : 
        initialData.result.total

      // Process itembasetypes dimensions (grouped)
      const itembasetypesDimensions = initialData.result.dimensions?.filter(d => 
        d.id.startsWith('itembasetypes')
      ) || []
      
      const processedItembasetypes = itembasetypesDimensions.map(dimension => {
        const dictionary = dictionaries[dimension.dictionaryId]
        if (!dictionary) return null

        const processedData = dimension.counts.map(count => ({
          key: count.key,
          name: dictionary.values[count.key] || `Key_${count.key}`,
          count: count.count,
          percentage: ((count.count / trueTotal) * 100).toFixed(1),
          resolved: !!dictionary.values[count.key]
        }))

        // Apply attribute grouping
        let finalData = processedData
        if (dimension.id.startsWith('itembasetypes-')) {
          finalData = applyAttributeGrouping(processedData, dimension.id)
        }

        return {
          id: dimension.id,
          dictionaryId: dimension.dictionaryId,
          data: finalData.sort((a, b) => b.count - a.count).slice(0, 50)
        }
      }).filter(Boolean)

      // Process itemmods dimensions (raw)
      const itemmodsDimensions = initialData.result.dimensions?.filter(d => 
        d.id.startsWith('itemmods')
      ) || []
      
      const processedItemmods = itemmodsDimensions.map(dimension => {
        const dictionary = dictionaries[dimension.dictionaryId]
        if (!dictionary) return null

        const processedData = dimension.counts.map(count => ({
          key: count.key,
          name: dictionary.values[count.key] || `Key_${count.key}`,
          count: count.count,
          percentage: ((count.count / trueTotal) * 100).toFixed(1),
          resolved: !!dictionary.values[count.key]
        }))

        return {
          id: dimension.id,
          dictionaryId: dimension.dictionaryId,
          data: processedData.sort((a, b) => b.count - a.count).slice(0, 50)
        }
      }).filter(Boolean)

      // Process skills dimensions (raw)
      const skillsDimensions = initialData.result.dimensions?.filter(d => 
        d.id === 'skills'
      ) || []
      
      const processedSkills = skillsDimensions.map(dimension => {
        const dictionary = dictionaries[dimension.dictionaryId]
        if (!dictionary) return null

        const processedData = dimension.counts.map(count => ({
          key: count.key,
          name: dictionary.values[count.key] || `Key_${count.key}`,
          count: count.count,
          percentage: ((count.count / trueTotal) * 100).toFixed(1),
          resolved: !!dictionary.values[count.key]
        }))

        return {
          id: dimension.id,
          dictionaryId: dimension.dictionaryId,
          data: processedData.sort((a, b) => b.count - a.count).slice(0, 50)
        }
      }).filter(Boolean)

      setAnalysisData({
        trueTotal,
        itembasetypes: processedItembasetypes,
        itemmods: processedItemmods,
        skills: processedSkills
      })
    } catch (err) {
      console.error('Error processing initial data:', err)
    } finally {
      setLoading(false)
    }
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

  const handleGroupClick = async (group, skillName = null) => {
    if (!group.isGroup) return
    
    setSelectedGroup(group)
    setAggregationLoading(true)
    setCurrentAggregationCall('Preparing API calls...')
    
    // Use provided skill or current selected skill
    const skillToUse = skillName || selectedSkill
    
    try {
      // Extract basetypes from group
      const basetypes = group.groupItems.map(item => item.name)
      
      setAggregationProgress({ current: 0, total: basetypes.length })
      
      const result = await aggregateBasetypes(
        snapshotId, 
        group.category, 
        group.attribute, 
        basetypes, 
        skillToUse,
        (current, total, basetype) => {
          setAggregationProgress({ current, total })
          setCurrentAggregationCall(`Processing ${basetype}... (${current}/${total})`)
        }
      )
      
      if (result.results.length > 0) {
        // Process aggregated data like in AggregationPanel
        const totalBuilds = result.results.reduce((sum, r) => sum + r.trueTotal, 0)
        const itemmodsAggregated = {}
        const skillsAggregated = {}
        
        // Process each result
        for (const res of result.results) {
          setCurrentAggregationCall(`Processing ${res.basetype}...`)
          
          // Process itemmods dimensions
          const itemmodsDimensions = res.data.result.dimensions?.filter(d => d.id.startsWith('itemmods')) || []
          const seenModifiers = new Map()
          
          for (const dimension of itemmodsDimensions) {
            const dictionary = res.dictionaries?.[dimension.dictionaryId]
            if (!dictionary) continue
            
            dimension.counts.forEach(count => {
              const name = dictionary.values[count.key] || `Key_${count.key}`
              
              if (!seenModifiers.has(name) || count.count > seenModifiers.get(name).count) {
                seenModifiers.set(name, count)
              }
            })
          }
          
          seenModifiers.forEach((count, name) => {
            const percentage = (count.count / res.trueTotal) * 100
            
            if (!itemmodsAggregated[name]) {
              itemmodsAggregated[name] = { totalCount: 0, basetypes: [] }
            }
            
            itemmodsAggregated[name].totalCount += count.count
            itemmodsAggregated[name].basetypes.push(`${res.basetype}: ${percentage.toFixed(1)}%`)
          })
          
          // Process skills dimension
          const skillsDimension = res.data.result.dimensions?.find(d => d.id === 'skills')
          if (skillsDimension) {
            const dictionary = res.dictionaries?.[skillsDimension.dictionaryId]
            if (dictionary) {
              skillsDimension.counts.forEach(count => {
                const name = dictionary.values[count.key] || `Key_${count.key}`
                const percentage = (count.count / res.trueTotal) * 100
                
                if (!skillsAggregated[name]) {
                  skillsAggregated[name] = { totalCount: 0, basetypes: [] }
                }
                
                skillsAggregated[name].totalCount += count.count
                skillsAggregated[name].basetypes.push(`${res.basetype}: ${percentage.toFixed(1)}%`)
              })
            }
          }
        }
        
        // Convert to arrays and sort
        const itemmodsArray = Object.entries(itemmodsAggregated)
          .map(([name, data]) => ({ 
            name, 
            percentage: (data.totalCount / totalBuilds) * 100, 
            count: data.totalCount, 
            basetypes: data.basetypes 
          }))
          .sort((a, b) => b.percentage - a.percentage)
          .slice(0, 50)

        const skillsArray = Object.entries(skillsAggregated)
          .map(([name, data]) => ({ 
            name, 
            percentage: (data.totalCount / totalBuilds) * 100, 
            count: data.totalCount, 
            basetypes: data.basetypes 
          }))
          .sort((a, b) => b.percentage - a.percentage)
          .slice(0, 50)

        const basetypeDistribution = result.results.map(res => ({
          name: res.basetype,
          count: res.trueTotal,
          percentage: ((res.trueTotal / totalBuilds) * 100).toFixed(1)
        }))

        setAggregationData({
          totalBuilds,
          itemMods: itemmodsArray,
          skills: skillsArray,
          basetypeDistribution,
          errors: result.errors,
          skipped: result.skipped
        })
      }
    } catch (err) {
      console.error('Aggregation error:', err)
    } finally {
      setAggregationLoading(false)
      setCurrentAggregationCall('')
    }
  }

  const handleUnselectGroup = () => {
    setSelectedGroup(null)
    setAggregationData(null)
  }

  const handleSkillClick = async (skill) => {
    if (selectedSkill === skill.name) {
      // Unselect skill
      setSelectedSkill(null)
      setIsSkillFiltered(false)
      setSkillFilteredData(null)
      
      // If basetype group is selected, re-aggregate without skill filter
      if (selectedGroup) {
        await handleGroupClick(selectedGroup)
      }
      return
    }

    setSelectedSkill(skill.name)
    setIsSkillFiltered(true)
    setAggregationLoading(true)
    setCurrentAggregationCall('Filtering by skill...')

    try {
      if (selectedGroup) {
        // Re-aggregate with skill filter
        setAggregationProgress({ current: 0, total: selectedGroup.groupItems.length })
        await handleGroupClick(selectedGroup, skill.name)
      } else {
        // Filter the current data by skill only
        setCurrentAggregationCall('Fetching skill-filtered data...')
        
        const result = await fetchSkillFilteredData(snapshotId, rareItem, skill.name)
        
        if (result && result.data) {
          // Process the skill-filtered data similar to processInitialData
          const processedData = processSkillFilteredData(result.data, result.dictionaries)
          setSkillFilteredData(processedData)
        }
      }
    } catch (err) {
      console.error('Skill filtering error:', err)
    } finally {
      setAggregationLoading(false)
      setCurrentAggregationCall('')
      setAggregationProgress({ current: 0, total: 0 })
    }
  }

  const processSkillFilteredData = (data, skillDictionaries) => {
    // Calculate true total
    const secondAscendancyDimension = data.result.dimensions?.find(d => d.id === 'secondascendancy')
    const trueTotal = secondAscendancyDimension ? 
      secondAscendancyDimension.counts.reduce((sum, count) => sum + count.count, 0) : 
      data.result.total

    // Process itembasetypes dimensions (grouped)
    const itembasetypesDimensions = data.result.dimensions?.filter(d => 
      d.id.startsWith('itembasetypes')
    ) || []
    
    const processedItembasetypes = itembasetypesDimensions.map(dimension => {
      const dictionary = skillDictionaries[dimension.dictionaryId]
      if (!dictionary) return null

      const processedData = dimension.counts.map(count => ({
        key: count.key,
        name: dictionary.values[count.key] || `Key_${count.key}`,
        count: count.count,
        percentage: ((count.count / trueTotal) * 100).toFixed(1),
        resolved: !!dictionary.values[count.key]
      }))

      // Apply attribute grouping
      let finalData = processedData
      if (dimension.id.startsWith('itembasetypes-')) {
        finalData = applyAttributeGrouping(processedData, dimension.id)
      }

      return {
        id: dimension.id,
        dictionaryId: dimension.dictionaryId,
        data: finalData.sort((a, b) => b.count - a.count).slice(0, 50)
      }
    }).filter(Boolean)

    // Process itemmods dimensions (raw)
    const itemmodsDimensions = data.result.dimensions?.filter(d => 
      d.id.startsWith('itemmods')
    ) || []
    
    const processedItemmods = itemmodsDimensions.map(dimension => {
      const dictionary = skillDictionaries[dimension.dictionaryId]
      if (!dictionary) return null

      const processedData = dimension.counts.map(count => ({
        key: count.key,
        name: dictionary.values[count.key] || `Key_${count.key}`,
        count: count.count,
        percentage: ((count.count / trueTotal) * 100).toFixed(1),
        resolved: !!dictionary.values[count.key]
      }))

      return {
        id: dimension.id,
        dictionaryId: dimension.dictionaryId,
        data: processedData.sort((a, b) => b.count - a.count).slice(0, 50)
      }
    }).filter(Boolean)

    // Process skills dimensions (raw)
    const skillsDimensions = data.result.dimensions?.filter(d => 
      d.id === 'skills'
    ) || []
    
    const processedSkills = skillsDimensions.map(dimension => {
      const dictionary = skillDictionaries[dimension.dictionaryId]
      if (!dictionary) return null

      const processedData = dimension.counts.map(count => ({
        key: count.key,
        name: dictionary.values[count.key] || `Key_${count.key}`,
        count: count.count,
        percentage: ((count.count / trueTotal) * 100).toFixed(1),
        resolved: !!dictionary.values[count.key]
      }))

      return {
        id: dimension.id,
        dictionaryId: dimension.dictionaryId,
        data: processedData.sort((a, b) => b.count - a.count).slice(0, 50)
      }
    }).filter(Boolean)

    return {
      trueTotal,
      itembasetypes: processedItembasetypes,
      itemmods: processedItemmods,
      skills: processedSkills
    }
  }

  const handleClearFilters = () => {
    setSelectedGroup(null)
    setSelectedSkill(null)
    setIsSkillFiltered(false)
    setSkillFilteredData(null)
    setAggregationData(null)
  }

  if (!isOpen) return null

  return (
    <div className="analysis-overlay">
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="overlay-content">
        <div className="overlay-header">
          <div className="header-left">
            <h2>{rareItem} Analysis</h2>
            {(selectedGroup || selectedSkill) && (
              <div className="current-filters">
                {selectedGroup && (
                  <span className="filter-tag">
                    Group: {selectedGroup.name}
                  </span>
                )}
                {selectedSkill && (
                  <span className="filter-tag">
                    Skill: {selectedSkill}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="header-right">
            {(selectedGroup || selectedSkill) && (
              <button className="clear-filters-btn" onClick={handleClearFilters}>
                Clear Filters
              </button>
            )}
            <button className="overlay-close" onClick={onClose}>×</button>
          </div>
        </div>
        
        {loading ? (
          <div className="overlay-loading">
            <div className="loading-spinner"></div>
            <p>Processing data...</p>
          </div>
        ) : (
          <div className="overlay-columns">
            {/* Column 1: Item Basetypes */}
            <div className="overlay-column">
              <div className="column-header">
                <h3>Item Basetypes</h3>
                {selectedGroup && (
                  <button className="unselect-button" onClick={handleUnselectGroup}>
                    Unselect Group
                  </button>
                )}
              </div>
              <div className="column-content">
                {selectedGroup ? (
                  // Post-aggregation view
                  <div>
                    <div className="selected-group">
                      <div className="group-name">{selectedGroup.name}</div>
                      <div className="group-stats">
                        {selectedGroup.count} builds ({selectedGroup.percentage}%)
                      </div>
                    </div>
                    
                    {aggregationData && (
                      <div className="basetype-distribution">
                        <h4>Basetype Distribution</h4>
                        {aggregationData.basetypeDistribution.map((basetype, index) => (
                          <div key={index} className="basetype-item">
                            <span className="basetype-name">{basetype.name}</span>
                            <span className="basetype-count">{basetype.count}</span>
                            <span className="basetype-percentage">{basetype.percentage}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  // Pre-aggregation view - use skill filtered data if available
                  (skillFilteredData?.itembasetypes || analysisData?.itembasetypes)?.map((dimension, dimIndex) => (
                    <div key={dimIndex} className="dimension-section">
                      <h4>{dimension.id}</h4>
                      {dimension.data.map((item, index) => (
                        <div 
                          key={index} 
                          className={`data-item ${item.isGroup ? 'group-item clickable' : ''}`}
                          onClick={() => item.isGroup && handleGroupClick(item)}
                        >
                          <span className="item-name">{item.name}</span>
                          <span className="item-count">{item.count}</span>
                          <span className="item-percentage">{item.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Column 2: Item Modifiers */}
            <div className="overlay-column">
              <div className="column-header">
                <h3>Item Modifiers</h3>
                {aggregationLoading && (
                  <div className="loading-indicator">
                    <div className="small-spinner"></div>
                    <div className="loading-text">
                      <span>{currentAggregationCall}</span>
                      {aggregationProgress.total > 0 && (
                        <div className="progress-info">
                          {aggregationProgress.current}/{aggregationProgress.total} calls completed
                          <div className="progress-bar">
                            <div 
                              className="progress-fill" 
                              style={{ 
                                width: `${(aggregationProgress.current / aggregationProgress.total) * 100}%` 
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="column-content">
                {aggregationData ? (
                  // Post-aggregation view
                  <div>
                    <div className="column-stats">
                      {aggregationData.itemMods.length} unique modifiers
                    </div>
                    {aggregationData.itemMods.map((mod, index) => (
                      <div key={index} className="data-item">
                        <span className="item-name">{mod.name}</span>
                        <span className="item-count">{mod.count}</span>
                        <span className="item-percentage">{mod.percentage.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Pre-aggregation view - use skill filtered data if available
                  (skillFilteredData?.itemmods || analysisData?.itemmods)?.map((dimension, dimIndex) => (
                    <div key={dimIndex} className="dimension-section">
                      <h4>{dimension.id}</h4>
                      <div className="column-stats">
                        {dimension.data.length} modifiers
                      </div>
                      {dimension.data.map((item, index) => (
                        <div key={index} className="data-item">
                          <span className="item-name">{item.name}</span>
                          <span className="item-count">{item.count}</span>
                          <span className="item-percentage">{item.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Column 3: Skills */}
            <div className="overlay-column">
              <div className="column-header">
                <h3>Skills</h3>
              </div>
              <div className="column-content">
                {aggregationData ? (
                  // Post-aggregation view
                  <div>
                    <div className="column-stats">
                      {aggregationData.skills.length} unique skills
                    </div>
                    {aggregationData.skills.map((skill, index) => (
                      <div 
                        key={index} 
                        className={`data-item clickable ${selectedSkill === skill.name ? 'selected-skill' : ''}`}
                        onClick={() => handleSkillClick(skill)}
                      >
                        <span className="item-name">{skill.name}</span>
                        <span className="item-count">{skill.count}</span>
                        <span className="item-percentage">{skill.percentage.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Pre-aggregation view - use skill filtered data if available
                  (skillFilteredData?.skills || analysisData?.skills)?.map((dimension, dimIndex) => (
                    <div key={dimIndex} className="dimension-section">
                      <h4>{dimension.id}</h4>
                      <div className="column-stats">
                        {dimension.data.length} skills
                      </div>
                      {dimension.data.map((item, index) => (
                        <div 
                          key={index} 
                          className={`data-item clickable ${selectedSkill === item.name ? 'selected-skill' : ''}`}
                          onClick={() => handleSkillClick(item)}
                        >
                          <span className="item-name">{item.name}</span>
                          <span className="item-count">{item.count}</span>
                          <span className="item-percentage">{item.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AnalysisOverlay