import React, { useState, useEffect } from 'react'
import usePoeApi from '../hooks/usePoeApi'
import './AnalysisOverlay.css'

const AnalysisOverlay = ({ isOpen, onClose, snapshotId, initialData, dictionaries }) => {
  // Unified filter state
  const [activeFilters, setActiveFilters] = useState({
    snapshotId: '',
    items: [],
    basetypes: [],
    modifiers: [],
    skills: []
  })
  
  // Unified data state
  const [processedData, setProcessedData] = useState(null)

  // Unified loading state
  const [isLoading, setIsLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 })
  const [currentOperation, setCurrentOperation] = useState('')
  const [cacheStatus, setCacheStatus] = useState('')
  const [insufficientDataError, setInsufficientDataError] = useState(null)

  // Unified error state
  const [errors, setErrors] = useState([])

  // Filter-level cache
  const [filterCache, setFilterCache] = useState({})

  // Group expansion and selection state
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const [pendingSelections, setPendingSelections] = useState(null) // { dimension: 'basetypes', groupKey: '...', items: [...] }
  const [parentCallData, setParentCallData] = useState(null) // Stores data for percentage calculations
  
  // Debug panel state
  const [debugPanelOpen, setDebugPanelOpen] = useState(() => {
    return localStorage.getItem('debugPanelOpen') === 'true'
  })
  const [debugLogs, setDebugLogs] = useState([])
  const [debugActiveTab, setDebugActiveTab] = useState('dimensions')
  
  const { fetchSkillFilteredData, aggregateBasetypes } = usePoeApi()

  // Debug logging function
  const addDebugLog = (message, type = 'info', data = null) => {
    const logEntry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      message,
      type,
      data
    }
    setDebugLogs(prev => [...prev, logEntry])
    console.log(`[DEBUG ${type.toUpperCase()}]`, message, data)
  }

  // Toggle debug panel
  const toggleDebugPanel = () => {
    const newState = !debugPanelOpen
    setDebugPanelOpen(newState)
    localStorage.setItem('debugPanelOpen', newState.toString())
    addDebugLog(`Debug panel ${newState ? 'opened' : 'closed'}`)
  }

  // Get parent call state (current filters without basetypes)
  const getParentCallState = (filters) => {
    return {
      ...filters,
      basetypes: []
    }
  }

  // Generate combo key from current filter state (excluding basetypes)
  const generateComboKey = (filters) => {
    const parts = []
    if (filters.items.length > 0) parts.push(`items:${filters.items.sort().join(',')}`)
    // Only use first skill for now (multi-skill will use AND gate in future)
    if (filters.skills.length > 0) parts.push(`skills:${filters.skills[0]}`)
    // Future: if (filters.mods.length > 0) parts.push(`mods:${filters.mods.sort().join(',')}`)
    return parts.join('|') || 'base'
  }

  // Load custom selections from localStorage
  const loadCustomSelections = () => {
    try {
      const saved = localStorage.getItem('basetypeSelections')
      const data = saved ? JSON.parse(saved) : {}

      // Check size and cleanup if needed (5MB limit)
      const sizeInBytes = new Blob([saved || '']).size
      const maxSize = 5 * 1024 * 1024 // 5MB

      if (sizeInBytes > maxSize) {
        addDebugLog(`localStorage size limit exceeded (${(sizeInBytes / 1024 / 1024).toFixed(2)}MB), cleaning up...`, 'warning')
        return cleanupOldestCombos(data, maxSize)
      }

      return data
    } catch (e) {
      console.error('Failed to load custom selections:', e)
      return {}
    }
  }

  // Cleanup oldest combos to stay under size limit
  const cleanupOldestCombos = (data, maxSize) => {
    // Flatten all combos with timestamps
    const allCombos = []
    Object.keys(data).forEach(category => {
      Object.keys(data[category]).forEach(groupKey => {
        const groupData = data[category][groupKey]
        if (typeof groupData === 'object' && !Array.isArray(groupData)) {
          // New format: combo-specific
          Object.keys(groupData).forEach(comboKey => {
            allCombos.push({
              category,
              groupKey,
              comboKey,
              data: groupData[comboKey],
              timestamp: groupData[comboKey].timestamp || 0
            })
          })
        }
      })
    })

    // Sort by timestamp (oldest first)
    allCombos.sort((a, b) => a.timestamp - b.timestamp)

    // Remove oldest until size is acceptable
    const cleaned = {}
    let currentSize = 0
    const targetSize = maxSize * 0.9 // Stay at 90% of limit

    for (let i = allCombos.length - 1; i >= 0; i--) {
      const combo = allCombos[i]
      if (!cleaned[combo.category]) cleaned[combo.category] = {}
      if (!cleaned[combo.category][combo.groupKey]) cleaned[combo.category][combo.groupKey] = {}

      cleaned[combo.category][combo.groupKey][combo.comboKey] = combo.data

      currentSize = new Blob([JSON.stringify(cleaned)]).size
      if (currentSize > targetSize) {
        // Remove this one and stop
        delete cleaned[combo.category][combo.groupKey][combo.comboKey]
        break
      }
    }

    localStorage.setItem('basetypeSelections', JSON.stringify(cleaned))
    addDebugLog(`Cleaned up to ${(currentSize / 1024 / 1024).toFixed(2)}MB`, 'success')
    return cleaned
  }

  // Save custom selections to localStorage with combo-specific key
  const saveCustomSelections = (category, groupKey, items) => {
    try {
      const current = loadCustomSelections()
      const comboKey = generateComboKey(activeFilters)

      if (!current[category]) current[category] = {}
      if (!current[category][groupKey]) current[category][groupKey] = {}

      if (items.length === 0) {
        // Remove the combo entry if empty
        delete current[category][groupKey][comboKey]
        if (Object.keys(current[category][groupKey]).length === 0) {
          delete current[category][groupKey]
        }
        if (Object.keys(current[category]).length === 0) {
          delete current[category]
        }
      } else {
        current[category][groupKey][comboKey] = {
          items,
          timestamp: Date.now()
        }
      }

      localStorage.setItem('basetypeSelections', JSON.stringify(current))
      addDebugLog(`Saved custom selections for ${groupKey} (${comboKey})`, 'info', { category, groupKey, comboKey, items })
    } catch (e) {
      console.error('Failed to save custom selections:', e)
    }
  }

  // Get default selections (top 6 from priority list - fallback)
  const getDefaultSelectionsByPriority = (category, attribute) => {
    const attributeGroups = getAttributeGroupsForCategory(category)

    if (attribute === 'ungrouped') {
      // For ungrouped, we don't have a priority list - must use count-based
      return []
    }

    const allBasetypes = attributeGroups?.[attribute] || []
    return allBasetypes.slice(0, 6)
  }

  // Get top 6 basetypes by count from parent data
  const getTop6ByCount = (category, attribute) => {
    const basetypeData = extractBasetypeData(parentCallData || processedData)

    if (!basetypeData) {
      addDebugLog(`⚠️ Using default priority order (parent data unavailable)`, 'warning')
      return getDefaultSelectionsByPriority(category, attribute)
    }

    const groupItems = basetypeData.groupItems?.[attribute]

    if (!groupItems || groupItems.length === 0) {
      // Fallback to priority order
      if (attribute === 'ungrouped') {
        addDebugLog(`⚠️ No basetype data for ungrouped - using all available`, 'warning')
        return []
      }
      addDebugLog(`⚠️ Using default priority order (no count data for ${attribute})`, 'warning')
      return getDefaultSelectionsByPriority(category, attribute)
    }

    // Sort by count and take top 6
    const top6 = groupItems
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map(item => item.name)

    addDebugLog(`Calculated top 6 by count for ${attribute}`, 'info', { top6 })
    return top6
  }

  // Get selections for a group (custom combo-specific or top 6 by count)
  const getSelectionsForGroup = (category, groupKey, attribute) => {
    const customSelections = loadCustomSelections()
    const comboKey = generateComboKey(activeFilters)

    // Check for combo-specific preference
    const comboData = customSelections[category]?.[groupKey]?.[comboKey]
    if (comboData && Array.isArray(comboData.items)) {
      addDebugLog(`Using saved preference for ${groupKey} (${comboKey})`, 'info', { items: comboData.items })
      return comboData.items
    }

    // No preference for this combo - use top 6 by count
    addDebugLog(`No preference for ${groupKey} (${comboKey}) - using top 6 by count`, 'info')
    return getTop6ByCount(category, attribute)
  }

  // Check if the result has insufficient data
  const hasInsufficientData = (result) => {
    if (!result) return true

    // Simple logic: If we're filtering by item only (no basetype, no skill)
    // and the API returned empty itembasetypes, itemmods, and skills,
    // then this is insufficient data
    const isItemOnlyFilter = activeFilters.items.length > 0 &&
                             activeFilters.basetypes.length === 0 &&
                             activeFilters.skills.length === 0

    if (isItemOnlyFilter) {
      // Check if the critical dimensions are empty
      const hasItembasetypes = result.itembasetypes?.some(dim => dim.data && dim.data.length > 0)
      const hasItemmods = result.itemmods?.some(dim => dim.data && dim.data.length > 0)
      const hasSkills = result.skills?.some(dim => dim.data && dim.data.length > 0)

      const debugInfo = {
        filterType: 'item-only',
        item: activeFilters.items[0],
        itembasetypes: { hasData: hasItembasetypes, count: result.itembasetypes?.reduce((sum, dim) => sum + (dim.data?.length || 0), 0) || 0 },
        itemmods: { hasData: hasItemmods, count: result.itemmods?.reduce((sum, dim) => sum + (dim.data?.length || 0), 0) || 0 },
        skills: { hasData: hasSkills, count: result.skills?.reduce((sum, dim) => sum + (dim.data?.length || 0), 0) || 0 }
      }

      const isInsufficient = !hasItembasetypes && !hasItemmods && !hasSkills

      addDebugLog(
        `Sufficiency check (item-only filter): ${isInsufficient ? 'INSUFFICIENT' : 'SUFFICIENT'}`,
        isInsufficient ? 'warning' : 'success',
        debugInfo
      )

      return isInsufficient
    }

    // For other filter types (basetype or skill filters), data is sufficient
    return false
  }

  // Retry function
  const retryInsufficientData = () => {
    addDebugLog('Retrying insufficient data call', 'info')
    setInsufficientDataError(null)

    // Clear cache for current filter combination
    const cacheKey = generateCacheKey(activeFilters)
    setFilterCache(prev => {
      const newCache = { ...prev }
      delete newCache[cacheKey]
      return newCache
    })

    // Re-execute the filter pipeline
    if (hasActiveFilters()) {
      executeFilterPipeline()
    }
  }

  // Ensure parent call data exists (for percentage calculations)
  const ensureParentCallData = async () => {
    const parentState = getParentCallState(activeFilters)
    const parentCacheKey = generateCacheKey(parentState)

    // If parent state is same as current (no basetypes), use current data
    if (activeFilters.basetypes.length === 0) {
      const currentCacheKey = generateCacheKey(activeFilters)
      if (parentCacheKey === currentCacheKey && filterCache[currentCacheKey]) {
        addDebugLog('Parent data same as current data, using processedData', 'success')
        setParentCallData(filterCache[currentCacheKey])
        return filterCache[currentCacheKey]
      }
    }

    // Check if we already have parent data
    if (filterCache[parentCacheKey]) {
      addDebugLog('Parent call data found in cache', 'success', { parentCacheKey })
      setParentCallData(filterCache[parentCacheKey])
      return filterCache[parentCacheKey]
    }

    // Need to fetch parent data
    addDebugLog('Fetching parent call data', 'info', { parentState })
    setIsLoading(true)
    setCurrentOperation('Loading basetype data...')

    try {
      let result
      if (parentState.skills.length > 0) {
        // Has skills, need to make API call
        result = await executeRegularFiltering(parentState)
      } else {
        // Item-only or no filters
        result = await executeRegularFiltering(parentState)
      }

      if (result) {
        // Cache it
        setFilterCache(prev => ({
          ...prev,
          [parentCacheKey]: result
        }))
        setParentCallData(result)
        addDebugLog('Parent call data fetched and cached', 'success', { parentCacheKey })
        return result
      }
    } catch (err) {
      addDebugLog('Failed to fetch parent call data', 'error', err)
    } finally {
      setIsLoading(false)
      setCurrentOperation('')
    }

    return null
  }

  // Extract raw basetype data with counts and calculate group percentages
  const extractBasetypeData = (data) => {
    if (!data?.itembasetypes || data.itembasetypes.length === 0) return null

    // Get raw itembasetypes dimension
    const itembasetypesDim = data.itembasetypes[0]
    if (!itembasetypesDim) return null

    // Use rawData if available, otherwise fall back to grouped data
    const rawBasetypes = itembasetypesDim.rawData || itembasetypesDim.data
    if (!rawBasetypes || rawBasetypes.length === 0) return null

    const category = itembasetypesDim.id.replace('itembasetypes-', '')

    // Calculate group totals
    const attributeGroups = getAttributeGroupsForCategory(category)
    const groupTotals = {}
    const groupItems = {}

    const hasGroups = attributeGroups && Object.keys(attributeGroups).length > 0

    if (hasGroups) {
      // Grouped category - process each attribute group
      Object.keys(attributeGroups).forEach(attribute => {
        const basetypes = attributeGroups[attribute]
        let total = 0
        const items = []

        basetypes.forEach(basetypeName => {
          const found = rawBasetypes.find(b => b.name === basetypeName)
          if (found) {
            total += found.count
            items.push({
              ...found,
              percentageOfGroup: 0 // Will calculate after we have total
            })
          }
        })

        // Calculate percentage of group
        items.forEach(item => {
          item.percentageOfGroup = total > 0 ? parseFloat(((item.count / total) * 100).toFixed(1)) : 0
        })

        groupTotals[attribute] = total
        groupItems[attribute] = items.sort((a, b) => b.count - a.count)
      })
    } else {
      // Non-grouped category - all basetypes belong to 'ungrouped'
      let total = 0
      const items = []

      rawBasetypes.forEach(basetype => {
        total += basetype.count
        items.push({
          ...basetype,
          percentageOfGroup: 0 // Will calculate after we have total
        })
      })

      // Calculate percentage of group
      items.forEach(item => {
        item.percentageOfGroup = total > 0 ? parseFloat(((item.count / total) * 100).toFixed(1)) : 0
      })

      groupTotals['ungrouped'] = total
      groupItems['ungrouped'] = items.sort((a, b) => b.count - a.count)
    }

    return {
      category,
      groupTotals,
      groupItems,
      rawBasetypes
    }
  }

  useEffect(() => {
    if (isOpen && initialData && dictionaries) {
      initializeOverlay()
    }
  }, [isOpen, initialData, dictionaries, snapshotId])

  useEffect(() => {
    if (activeFilters.snapshotId && hasActiveFilters()) {
      executeFilterPipeline()
      // Ensure parent call data is loaded for percentage calculations (only when basetypes selected)
      if (activeFilters.items.length > 0 && activeFilters.basetypes.length > 0) {
        ensureParentCallData()
      }
    } else if (activeFilters.snapshotId) {
      setProcessedData(generateInitialData())
    }

    // Auto-expand single group when no basetype selection active
    if (activeFilters.items.length > 0 && activeFilters.basetypes.length === 0 && processedData?.itembasetypes) {
      const groups = processedData.itembasetypes[0]?.data
      if (groups && groups.length === 1) {
        const singleGroupKey = groups[0].groupKey
        if (!expandedGroups.has(singleGroupKey)) {
          addDebugLog(`Auto-expanding single group: ${groups[0].name}`, 'info')
          setExpandedGroups(new Set([singleGroupKey]))
        }
      }
    }
  }, [activeFilters, processedData])

  const generateCacheKey = (filters) => {
    const parts = [filters.snapshotId]
    if (filters.items.length > 0) parts.push(`items:${filters.items.sort().join(',')}`)
    if (filters.basetypes.length > 0) parts.push(`basetypes:${filters.basetypes.sort().join(',')}`)
    if (filters.modifiers.length > 0) parts.push(`modifiers:${filters.modifiers.sort().join(',')}`)
    if (filters.skills.length > 0) parts.push(`skills:${filters.skills.sort().join(',')}`)
    return parts.join('|')
  }

  const initializeOverlay = () => {
    setActiveFilters(prev => ({ ...prev, snapshotId }))
    setProcessedData(generateInitialData())
    setErrors([])
    setInsufficientDataError(null)
  }

  const hasActiveFilters = () => {
    return activeFilters.items.length > 0 || 
           activeFilters.basetypes.length > 0 || 
           activeFilters.skills.length > 0
  }

  const generateInitialData = () => {
    // Calculate true total consistently
    const trueTotal = calculateTrueTotal(initialData)

    // Process items (rare items only)
    const items = processItemsDimension(initialData, dictionaries, trueTotal)

    // Process skills
    const skills = processSkillsDimension(initialData, dictionaries, trueTotal)

    return {
      trueTotal,
      items,
      itembasetypes: [],
      itemmods: [],
      skills
    }
  }

  const calculateTrueTotal = (data) => {
    const secondAscendancyDimension = data.result.dimensions?.find(d => d.id === 'secondascendancy')
    return secondAscendancyDimension ? 
      secondAscendancyDimension.counts.reduce((sum, count) => sum + count.count, 0) : 
      data.result.total
  }

  const processItemsDimension = (data, dicts, trueTotal) => {
    const itemsDimensions = data.result.dimensions?.filter(d => d.id === 'items') || []

    return itemsDimensions.map(dimension => {
      const dictionary = dicts[dimension.dictionaryId]
      if (!dictionary) return null

      const processedData = dimension.counts.map(count => ({
        key: count.key,
        name: dictionary.values[count.key] || `Key_${count.key}`,
        count: count.count,
        percentage: parseFloat(((count.count / trueTotal) * 100).toFixed(1)),
        resolved: !!dictionary.values[count.key]
      }))

      // Filter to only include rare items
      const rareItems = processedData.filter(item =>
        item.name && item.name.startsWith('Rare ')
      )

      return {
        id: dimension.id,
        dictionaryId: dimension.dictionaryId,
        data: rareItems.sort((a, b) => b.count - a.count)
      }
    }).filter(Boolean)
  }

  const processSkillsDimension = (data, dicts, trueTotal) => {
    const skillsDimensions = data.result.dimensions?.filter(d => d.id === 'skills') || []

    return skillsDimensions.map(dimension => {
      const dictionary = dicts[dimension.dictionaryId]
      if (!dictionary) return null

      const processedData = dimension.counts.map(count => ({
        key: count.key,
        name: dictionary.values[count.key] || `Key_${count.key}`,
        count: count.count,
        percentage: parseFloat(((count.count / trueTotal) * 100).toFixed(1)),
        resolved: !!dictionary.values[count.key]
      }))

      return {
        id: dimension.id,
        dictionaryId: dimension.dictionaryId,
        data: processedData.sort((a, b) => b.count - a.count).slice(0, 50)
      }
    }).filter(Boolean)
  }

  const executeFilterPipeline = async () => {
    const cacheKey = generateCacheKey(activeFilters)
    addDebugLog(`Starting filter pipeline for: ${cacheKey}`, 'info', activeFilters)
    
    // Check cache first
    if (filterCache[cacheKey]) {
      console.log('🎯 Cache hit for:', cacheKey)
      addDebugLog(`Cache hit for: ${cacheKey}`, 'success')
      setCacheStatus('🎯 Cache hit')
      setProcessedData(filterCache[cacheKey])
      setTimeout(() => setCacheStatus(''), 2000)
      return
    }
    
    console.log('📡 Cache miss, making API calls for:', cacheKey)
    addDebugLog(`Cache miss, making API calls for: ${cacheKey}`, 'info')
    setCacheStatus('📡 Cache miss')
    setIsLoading(true)
    setErrors([])
    setInsufficientDataError(null) // Clear previous insufficient data error
    setLoadingProgress({ current: 0, total: 0 })
    setCurrentOperation('Generating API calls...')

    try {
      let result
      
      // Check if we need basetype aggregation
      if (activeFilters.basetypes.length > 0) {
        result = await executeBasetypeAggregation()
      } else {
        result = await executeRegularFiltering()
      }
      
      // Check if result has insufficient data
      if (result && hasInsufficientData(result)) {
        addDebugLog(`Insufficient data detected for: ${cacheKey} - NOT caching`, 'warning', result)
        setInsufficientDataError({
          message: 'No meaningful data returned from API',
          cacheKey,
          filters: activeFilters
        })
        setProcessedData(result) // Still show what we got, but don't cache it
      } else if (result) {
        addDebugLog(`Caching result for: ${cacheKey}`, 'success', { cacheKey, resultKeys: Object.keys(result) })
        setInsufficientDataError(null) // Clear any previous error
        setFilterCache(prev => ({
          ...prev,
          [cacheKey]: result
        }))
        setProcessedData(result)

        // If no basetypes selected, current data IS the parent data
        if (activeFilters.basetypes.length === 0) {
          setParentCallData(result)
          addDebugLog('Set parent data to current data (no basetypes)', 'success')
        }
      } else {
        addDebugLog(`No result to cache for: ${cacheKey}`, 'warning')
      }
      
    } catch (err) {
      console.error('Filter pipeline error:', err)
      addDebugLog(`Filter pipeline error: ${err.message}`, 'error', err)
      setErrors([{ error: err.message }])
    } finally {
      setIsLoading(false)
      setCurrentOperation('')
      setTimeout(() => setCacheStatus(''), 2000)
    }
  }

  const executeBasetypeAggregation = async () => {
    // Extract category from activeFilters.basetypes (we need to determine category)
    const item = activeFilters.items[0] // Should be set when basetypes are selected
    const category = extractCategoryFromItem(item)

    if (!category) {
      throw new Error('Cannot determine category for basetype aggregation')
    }

    const selectedBasetypes = activeFilters.basetypes

    // Check which basetypes are already cached individually
    const cachedRawResults = [] // Store RAW API results, not aggregated
    const uncachedBasetypes = []

    for (const basetype of selectedBasetypes) {
      const basetypeCacheKey = `raw_basetype_${generateCacheKey({
        ...activeFilters,
        basetypes: [basetype]
      })}`

      if (filterCache[basetypeCacheKey]) {
        addDebugLog(`Individual cache hit: ${basetype}`, 'success')
        cachedRawResults.push(filterCache[basetypeCacheKey])
      } else {
        addDebugLog(`Individual cache miss: ${basetype}`, 'info')
        uncachedBasetypes.push(basetype)
      }
    }

    addDebugLog(`Basetype caching summary`, 'info', {
      total: selectedBasetypes.length,
      cached: cachedRawResults.length,
      needToFetch: uncachedBasetypes.length
    })

    setCurrentOperation(`Fetching ${uncachedBasetypes.length}/${selectedBasetypes.length} basetypes...`)
    setLoadingProgress({ current: 0, total: uncachedBasetypes.length })

    // Fetch uncached basetypes with all skills combined (single API call per basetype with AND gate)
    try {
      let freshResults = []

      if (uncachedBasetypes.length > 0) {
        // Pass all modifiers and skills as arrays
        const modsDesc = activeFilters.modifiers.length > 0 ? ` + ${activeFilters.modifiers.join(' + ')}` : ''
        const skillsDesc = activeFilters.skills.length > 0 ? ` + ${activeFilters.skills.join(' + ')}` : ''
        const filtersDesc = `${modsDesc}${skillsDesc}`
        setCurrentOperation(`Fetching basetypes${filtersDesc}...`)

        const { results, errors } = await aggregateBasetypes(
          activeFilters.snapshotId,
          category,
          null,
          uncachedBasetypes,
          activeFilters.modifiers.length > 0 ? activeFilters.modifiers : null,
          activeFilters.skills.length > 0 ? activeFilters.skills : null,
          (current, total, basetype) => {
            setLoadingProgress({ current, total })
            setCurrentOperation(`${basetype}${filtersDesc} (${current}/${total})`)
          }
        )

        // Cache individual RAW basetype results
        results.forEach(result => {
          const individualCacheKey = `raw_basetype_${generateCacheKey({
            ...activeFilters,
            basetypes: [result.basetype]
          })}`
          // Store the RAW result for this individual basetype
          setFilterCache(prev => ({
            ...prev,
            [individualCacheKey]: result
          }))
          addDebugLog(`Cached RAW basetype: ${result.basetype}`, 'success')
        })

        freshResults = results
        setErrors(errors)
      }

      // Merge cached RAW results with fresh results, THEN aggregate
      const allRawResults = [...cachedRawResults, ...freshResults]

      addDebugLog(`Aggregating combined results`, 'info', {
        cachedCount: cachedRawResults.length,
        freshCount: freshResults.length,
        totalCount: allRawResults.length
      })

      if (allRawResults.length > 0) {
        const aggregatedData = aggregateBasetypeResults(allRawResults, activeFilters)
        return aggregatedData
      }

      return null

    } catch (err) {
      setErrors([{ error: err.message }])
      return null
    }
  }

  const executeRegularFiltering = async (customFilters = null) => {
    const filters = customFilters || activeFilters
    const apiCalls = generateApiCalls(filters)
    setLoadingProgress({ current: 0, total: apiCalls.length })

    if (apiCalls.length === 0) {
      setProcessedData(generateInitialData())
      return
    }

    const results = []
    const callErrors = []

    for (let i = 0; i < apiCalls.length; i++) {
      const call = apiCalls[i]
      setCurrentOperation(`Fetching ${call.description}... (${i + 1}/${apiCalls.length})`)
      setLoadingProgress({ current: i, total: apiCalls.length })

      try {
        addDebugLog(`Making API call: ${call.description}`, 'info', call)
        const result = await fetchSkillFilteredData(
          filters.snapshotId,
          call.item,
          call.modifiers,
          call.skills
        )
        addDebugLog(`API call succeeded: ${call.description} - ${result.data.result.total} builds`, 'success', {
          call,
          buildCount: result.data.result.total,
          dimensionCount: result.data.result.dimensions?.length || 0
        })
        results.push({ ...result, metadata: call })
      } catch (err) {
        addDebugLog(`API call failed: ${call.description} - ${err.message}`, 'error', { call, error: err.message })
        callErrors.push({ call, error: err.message })
      }
    }

    setLoadingProgress({ current: apiCalls.length, total: apiCalls.length })
    setErrors(callErrors)

    if (results.length > 0) {
      const aggregatedData = aggregateFilterResults(results)
      console.log('aggregateFilterResults returned:', aggregatedData) // ADD THIS
      return aggregatedData
    }

    return null
  }

  const extractCategoryFromItem = (item) => {
    if (!item) return null

    // Extract category from item name (e.g., "Rare Body Armour" -> "Body Armour")
    // Keep original format with spaces for API calls
    const match = item.match(/^Rare (.+)$/)
    if (!match) return null

    const categoryName = match[1]

    // Map display names to internal category names (only for armor which has special keys)
    const categoryMap = {
      'Body Armour': 'BodyArmour',
      'Boots': 'Boots',
      'Gloves': 'Gloves',
      'Helmet': 'Helmet',
      'Shield': 'Shield'
    }

    // For armor, return special key; for everything else, return as-is with spaces
    return categoryMap[categoryName] || categoryName
  }

  const reconstructBasetypeGroups = (filters, totalBuilds) => {
    const item = filters.items[0]
    const category = extractCategoryFromItem(item)

    if (!category) return []

    // Check if this category has attribute groups defined
    const attributeGroups = getAttributeGroupsForCategory(category)
    const hasGroups = attributeGroups && Object.keys(attributeGroups).length > 0

    if (hasGroups) {
      // Grouped category (Helmets, Gloves, etc.)
      const categoryMap = {
        'BodyArmour': 'Body Armour',
        'Boots': 'Boots',
        'Gloves': 'Gloves',
        'Helmet': 'Helmets',
        'Shield': 'Shield'
      }

      const dataCategory = categoryMap[category]
      if (!dataCategory) return []

      // Create artificial groups showing all possible groups
      const allGroups = ['Dex', 'DexInt', 'Int', 'Str', 'StrDex', 'StrInt']

      const groupData = allGroups.map(attribute => {
        // Check if this group contains any of our selected basetypes
        const isSelected = isGroupSelected(attribute, category, filters.basetypes)

        return {
          key: `group_${attribute.toLowerCase()}_${category.toLowerCase()}`,
          name: `${attribute} ${category}`,
          count: isSelected ? totalBuilds : 0,
          percentage: isSelected ? 100.0 : 0.0,
          resolved: true,
          isGroup: true,
          groupKey: `group_${attribute.toLowerCase()}_${category.toLowerCase()}`,
          groupItems: [], // We don't need the individual items for display
          attribute,
          category,
          isSelected
        }
      })

      return [{
        id: `itembasetypes-${category}`,
        dictionaryId: 'artificial',
        data: groupData
      }]
    } else {
      // Non-grouped category (Bows, Rings, etc.) - create single group with category name
      const isSelected = filters.basetypes.length > 0

      // Get friendly category name (e.g., "Bow", "Ring", etc.)
      const friendlyName = category

      // All weapons use 'Weapon' dimension ID in the API
      const weaponTypes = [
        'Bow', 'Claw', 'Dagger', 'One Handed Axe', 'One Handed Mace', 'One Handed Sword',
        'Rune Dagger', 'Sceptre', 'Staff', 'Two Handed Axe', 'Two Handed Mace',
        'Two Handed Sword', 'Wand', 'Warstaff', 'Fishing Rod'
      ]

      // Use 'Weapon' for all weapons to match API dimension ID, otherwise use category as-is
      const dimensionCategory = weaponTypes.includes(category) ? 'Weapon' : category

      // For groupKey, also use generic 'weapon' for all weapon types to maintain consistency
      const groupKeyCategory = weaponTypes.includes(category) ? 'weapon' : category.toLowerCase()

      const ungroupedGroup = {
        key: `group_ungrouped_${groupKeyCategory}`,
        name: friendlyName,
        count: isSelected ? totalBuilds : totalBuilds, // Always show total count
        percentage: isSelected ? 100.0 : 100.0, // Always show 100%
        resolved: true,
        isGroup: true,
        groupKey: `group_ungrouped_${groupKeyCategory}`,
        groupItems: [],
        attribute: 'ungrouped',
        category,
        isSelected
      }

      return [{
        id: `itembasetypes-${dimensionCategory}`,
        dictionaryId: 'artificial',
        data: [ungroupedGroup]
      }]
    }
  }

  const isGroupSelected = (attribute, category, selectedBasetypes) => {
    // Get the attribute groups and check if any selected basetype belongs to this attribute
    const attributeGroups = getAttributeGroupsForCategory(category)
    const groupBasetypes = attributeGroups[attribute] || []
    
    return selectedBasetypes.some(basetype => groupBasetypes.includes(basetype))
  }

  const getAttributeGroupsForCategory = (category) => {
    const categoryMap = {
      'BodyArmour': 'Body Armour',
      'Boots': 'Boots',
      'Gloves': 'Gloves', 
      'Helmet': 'Helmets',
      'Shield': 'Shield'
    }
    
    const dataCategory = categoryMap[category]
    
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
    
    return attributeGroups[dataCategory] || {}
  }

  const generateApiCalls = (filters) => {
    const calls = []

    // Generate filter descriptions
    const modsDesc = filters.modifiers.length > 0 ? ` + ${filters.modifiers.join(' + ')}` : ''
    const skillsDesc = filters.skills.length > 0 ? ` + ${filters.skills.join(' + ')}` : ''
    const filtersDesc = `${modsDesc}${skillsDesc}`

    if (filters.basetypes.length > 0) {
      const item = filters.items[0]
      filters.basetypes.forEach(basetype => {
        calls.push({
          item,
          basetype,
          modifiers: filters.modifiers.length > 0 ? filters.modifiers : null,
          skills: filters.skills.length > 0 ? filters.skills : null,
          description: `${basetype}${filtersDesc}`
        })
      })
    } else if (filters.items.length > 0) {
      filters.items.forEach(item => {
        calls.push({
          item,
          basetype: null,
          modifiers: filters.modifiers.length > 0 ? filters.modifiers : null,
          skills: filters.skills.length > 0 ? filters.skills : null,
          description: `${item}${filtersDesc}`
        })
      })
    }
    
    return calls
  }

  const aggregateBasetypeResults = (results, filters) => {
    if (results.length === 0) return generateInitialData()
    
    // Calculate total builds across all successful calls (like maintest.html)
    const totalBuilds = results.reduce((sum, result) => sum + result.trueTotal, 0)
    
    // Aggregate itemmods dimensions - avoid double counting across multiple dimensions
    const itemmodsAggregated = {}
    const skillsAggregated = {}
    
    for (const result of results) {
      // Process itemmods dimensions - track modifiers per basetype to avoid duplicates
      const itemmodsDimensions = result.data.result.dimensions?.filter(d => d.id.startsWith('itemmods')) || []
      const seenModifiers = new Map() // Track highest count for each modifier name
      
      for (const dimension of itemmodsDimensions) {
        const dictionary = result.dictionaries[dimension.dictionaryId]
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
        if (!itemmodsAggregated[name]) {
          itemmodsAggregated[name] = { totalCount: 0, basetypes: [] }
        }
        
        itemmodsAggregated[name].totalCount += count.count
        const percentage = (count.count / result.trueTotal) * 100
        itemmodsAggregated[name].basetypes.push(`${result.basetype}: ${percentage.toFixed(1)}%`)
      })
      
      // Process skills dimension
      const skillsDimension = result.data.result.dimensions?.find(d => d.id === 'skills')
      if (skillsDimension) {
        const dictionary = result.dictionaries[skillsDimension.dictionaryId]
        if (dictionary) {
          skillsDimension.counts.forEach(count => {
            const name = dictionary.values[count.key] || `Key_${count.key}`
            
            if (!skillsAggregated[name]) {
              skillsAggregated[name] = { totalCount: 0, basetypes: [] }
            }
            
            skillsAggregated[name].totalCount += count.count
            const percentage = (count.count / result.trueTotal) * 100
            skillsAggregated[name].basetypes.push(`${result.basetype}: ${percentage.toFixed(1)}%`)
          })
        }
      }
    }
    
    // Convert to final format - calculate percentage based on total builds
    const itemmodsArray = Object.entries(itemmodsAggregated)
      .map(([name, data]) => ({
        key: name,
        name,
        count: data.totalCount,
        percentage: parseFloat(((data.totalCount / totalBuilds) * 100).toFixed(1)),
        resolved: true
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
    
    const skillsArray = Object.entries(skillsAggregated)
      .map(([name, data]) => ({
        key: name,
        name,
        count: data.totalCount,
        percentage: parseFloat(((data.totalCount / totalBuilds) * 100).toFixed(1)),
        resolved: true
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
    
    // Reconstruct basetype groups artificially showing selected group at 100%
    const itembasetypes = reconstructBasetypeGroups(filters, totalBuilds)
    
    return {
      trueTotal: totalBuilds,
      items: processedData?.items || [], // Keep original items
      itembasetypes,
      itemmods: [{
        id: 'itemmods-aggregated',
        dictionaryId: 'aggregated',
        data: itemmodsArray
      }],
      skills: [{
        id: 'skills-aggregated',
        dictionaryId: 'aggregated',
        data: skillsArray
      }]
    }
  }

  const aggregateFilterResults = (results) => {
    if (results.length === 0) return generateInitialData()
    
    // Use first result as base
    const baseResult = results[0]
    const trueTotal = calculateTrueTotal(baseResult.data)
    
    // Process each dimension type consistently
    const itembasetypes = processDimensionFromResults(results, 'itembasetypes', trueTotal)
    const itemmods = processDimensionFromResults(results, 'itemmods', trueTotal)
    const skills = processDimensionFromResults(results, 'skills', trueTotal)
    
    return {
      trueTotal,
      items: processedData?.items || [], // Keep original items
      itembasetypes,
      itemmods,
      skills
    }
  }

  const processDimensionFromResults = (results, dimensionPrefix, trueTotal) => {
    const dimensionMap = new Map() // Group by dimension ID to avoid duplicates
    const rawDataMap = new Map() // Store raw ungrouped data

    results.forEach(result => {
      const dimensions = result.data.result.dimensions?.filter(d =>
        d.id === dimensionPrefix || d.id.startsWith(dimensionPrefix)
      ) || []

      dimensions.forEach(dimension => {
        const dictionary = result.dictionaries[dimension.dictionaryId]
        if (!dictionary) return

        const processedData = dimension.counts.map(count => ({
          key: count.key,
          name: dictionary.values[count.key] || `Key_${count.key}`,
          count: count.count,
          percentage: parseFloat(((count.count / trueTotal) * 100).toFixed(1)),
          resolved: !!dictionary.values[count.key]
        }))

        // Store raw data before grouping (for itembasetypes)
        if (dimension.id.startsWith('itembasetypes-')) {
          rawDataMap.set(dimension.id, processedData)
        }

        // Apply attribute grouping for itembasetypes
        let finalData = processedData
        if (dimension.id.startsWith('itembasetypes-')) {
          finalData = applyAttributeGrouping(processedData, dimension.id)
        }

        // Merge duplicate dimensions by ID
        if (dimensionMap.has(dimension.id)) {
          const existing = dimensionMap.get(dimension.id)
          // Merge the data arrays and deduplicate by name
          const mergedData = [...existing.data, ...finalData]
          const uniqueData = mergedData.reduce((acc, item) => {
            const existingItem = acc.find(x => x.name === item.name)
            if (existingItem) {
              // Sum counts and recalculate percentage
              existingItem.count += item.count
              existingItem.percentage = parseFloat(((existingItem.count / trueTotal) * 100).toFixed(1))
            } else {
              acc.push(item)
            }
            return acc
          }, [])

          existing.data = uniqueData.sort((a, b) => b.count - a.count).slice(0, 50)
          // Also merge rawData if this is itembasetypes
          if (dimension.id.startsWith('itembasetypes-') && rawDataMap.has(dimension.id)) {
            const existingRaw = existing.rawData || []
            const newRaw = rawDataMap.get(dimension.id) || []
            existing.rawData = [...existingRaw, ...newRaw]
          }
        } else {
          dimensionMap.set(dimension.id, {
            id: dimension.id,
            dictionaryId: dimension.dictionaryId,
            data: finalData.sort((a, b) => b.count - a.count).slice(0, 50),
            rawData: rawDataMap.get(dimension.id) // Attach raw ungrouped data
          })
        }
      })
    })

    return Array.from(dimensionMap.values())
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

    // If category not in map, it's a non-grouped category (Bow, Ring, etc.)
    if (!dataCategory) {
      // Create single "Ungrouped" group containing all basetypes
      const totalCount = data.reduce((sum, item) => sum + item.count, 0)
      const totalPercentage = data.reduce((sum, item) => sum + item.percentage, 0)

      return [{
        name: `${category}`,
        count: totalCount,
        percentage: parseFloat(totalPercentage.toFixed(1)),
        resolved: true,
        isGroup: true,
        groupKey: `group_ungrouped_${category.toLowerCase()}`,
        groupItems: data.map(item => ({
          ...item,
          percentageOfGroup: totalCount > 0 ? parseFloat(((item.count / totalCount) * 100).toFixed(1)) : 0
        })),
        attribute: 'ungrouped',
        category
      }]
    }

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
          totalPercentage += item.percentage
          ungroupedItems.splice(itemIndex, 1)
        }
      })
      
      if (matchedItems.length > 0) {
        const group = {
          name: `${attribute} ${category} (${matchedItems.length} types)`,
          count: totalCount,
          percentage: parseFloat(totalPercentage.toFixed(1)),
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

  // Event handlers
  const handleItemClick = (item) => {
    setActiveFilters(prev => ({
      ...prev,
      items: prev.items.includes(item.name) 
        ? prev.items.filter(i => i !== item.name)
        : [item.name],
      basetypes: []
    }))
  }

  const handleSkillClick = (skill) => {
    setActiveFilters(prev => ({
      ...prev,
      skills: prev.skills.includes(skill.name)
        ? prev.skills.filter(s => s !== skill.name)
        : [...prev.skills, skill.name]
    }))
  }

  const handleModifierClick = (modifier) => {
    setActiveFilters(prev => ({
      ...prev,
      modifiers: prev.modifiers.includes(modifier.name)
        ? prev.modifiers.filter(m => m !== modifier.name)
        : [...prev.modifiers, modifier.name]
    }))
  }

  const handleGroupClick = async (group) => {
    // Check if this group is already selected (toggle behavior)
    if (group.isSelected) {
      addDebugLog(`Group unselect: ${group.name}`, 'info')
      setActiveFilters(prev => ({
        ...prev,
        basetypes: []
      }))
      setExpandedGroups(new Set())
      setPendingSelections(null)
    } else {
      // Get selections for this group (custom or default)
      const category = extractCategoryFromItem(activeFilters.items[0])
      const groupKey = group.groupKey
      const selections = getSelectionsForGroup(category, groupKey, group.attribute)

      addDebugLog(`Group select: ${group.name} - applying immediately`, 'info', { selections })

      // Collapse all other groups, expand this one
      setExpandedGroups(new Set([groupKey]))

      // Enter selection mode with pending state (for checkboxes)
      setPendingSelections({
        dimension: 'basetypes',
        groupKey,
        category,
        attribute: group.attribute,
        items: selections
      })

      // Apply immediately
      setActiveFilters(prev => ({
        ...prev,
        basetypes: selections
      }))
    }
  }

  // Toggle group expansion (preview mode)
  const toggleGroupExpansion = (groupKey) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey)
        addDebugLog(`Collapsed group: ${groupKey}`, 'info')
      } else {
        newSet.add(groupKey)
        addDebugLog(`Expanded group: ${groupKey} - preview mode`, 'info')
      }
      return newSet
    })
  }

  // Handle basetype checkbox toggle
  const handleBasetypeToggle = (basetype, groupKey, category, attribute) => {
    if (!pendingSelections) {
      // Starting from preview mode - select only this basetype and apply immediately
      addDebugLog(`Single basetype select from preview - applying immediately: ${basetype}`, 'info')

      setExpandedGroups(new Set([groupKey]))
      setPendingSelections({
        dimension: 'basetypes',
        groupKey,
        category,
        attribute,
        items: [basetype]
      })

      // Apply immediately
      setActiveFilters(prev => ({
        ...prev,
        basetypes: [basetype]
      }))
      return
    }

    // Toggle in existing selection (manual checkbox change in selection mode)
    const newItems = pendingSelections.items.includes(basetype)
      ? pendingSelections.items.filter(item => item !== basetype)
      : [...pendingSelections.items, basetype]

    addDebugLog(`Toggled basetype: ${basetype}`, 'info', { newItems })

    // Update pending selections
    setPendingSelections(prev => ({
      ...prev,
      items: newItems
    }))

    // Check if ALL individual basetypes in newItems are cached
    const allCached = newItems.every(bt => {
      const individualCacheKey = `raw_basetype_${generateCacheKey({
        ...activeFilters,
        basetypes: [bt]
      })}`
      return filterCache[individualCacheKey]
    })

    if (allCached && newItems.length > 0) {
      // All individual components are cached - auto-apply
      addDebugLog(`Auto-applying: all ${newItems.length} basetypes individually cached`, 'success', { newItems })
      setActiveFilters({ ...activeFilters, basetypes: newItems })
      saveCustomSelections(category, groupKey, newItems)
    } else if (newItems.length === 0) {
      // Empty selection - auto-apply to clear
      addDebugLog(`Auto-applying: empty selection`, 'info')
      setActiveFilters({ ...activeFilters, basetypes: [] })
      saveCustomSelections(category, groupKey, [])
    } else {
      // Some basetypes not cached - need to fetch
      const cachedCount = newItems.filter(bt => {
        const individualCacheKey = `raw_basetype_${generateCacheKey({
          ...activeFilters,
          basetypes: [bt]
        })}`
        return filterCache[individualCacheKey]
      }).length

      addDebugLog(`Pending: ${newItems.length - cachedCount}/${newItems.length} basetypes need fetching`, 'info', {
        newItems,
        cachedCount,
        needToFetch: newItems.length - cachedCount
      })
      // Don't apply, let user click Apply button
    }
  }

  // Apply pending selections
  const applyPendingSelections = () => {
    if (!pendingSelections) return

    const { items, category, groupKey } = pendingSelections

    if (items.length === 0) {
      // Empty selection - revert to no basetype filter
      addDebugLog(`Applying empty selection - reverting to no basetypes`, 'info')
      saveCustomSelections(category, groupKey, [])
      setActiveFilters(prev => ({ ...prev, basetypes: [] }))
      setPendingSelections(null)
      setExpandedGroups(new Set())
    } else {
      // Apply selection and keep pendingSelections for visual state
      addDebugLog(`Applying pending selections`, 'info', { items })
      saveCustomSelections(category, groupKey, items)
      setActiveFilters(prev => ({ ...prev, basetypes: items }))
      // Keep pendingSelections so green highlighting persists
    }
  }

  // Cancel pending selections
  const cancelPendingSelections = () => {
    addDebugLog(`Cancelling pending selections`, 'info')
    setPendingSelections(null)
  }

  // Reset to top 6 by count for current group
  const resetToTopSix = () => {
    if (!pendingSelections) return

    const { category, attribute, groupKey } = pendingSelections
    const top6 = getTop6ByCount(category, attribute)

    addDebugLog(`Resetting to top 6 by count`, 'info', { top6 })

    // Update pending selections
    setPendingSelections(prev => ({
      ...prev,
      items: top6
    }))

    // Check if all are cached
    const allCached = top6.every(bt => {
      const individualCacheKey = `raw_basetype_${generateCacheKey({
        ...activeFilters,
        basetypes: [bt]
      })}`
      return filterCache[individualCacheKey]
    })

    if (allCached && top6.length > 0) {
      // Auto-apply
      addDebugLog(`Auto-applying reset: all ${top6.length} basetypes cached`, 'success')
      setActiveFilters({ ...activeFilters, basetypes: top6 })
      saveCustomSelections(category, groupKey, top6)
    }
    // Otherwise Apply button will show
  }

  const handleClearFilters = () => {
    setActiveFilters(prev => ({
      ...prev,
      items: [],
      basetypes: [],
      skills: []
    }))
    setPendingSelections(null)
    setExpandedGroups(new Set())
  }


  if (!isOpen) return null

  return (
    <div className="analysis-overlay">
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="overlay-content">
        <div className="overlay-header">
          <div className="header-left">
            <div className="header-title-row">
              <h2>POE.ninja Analysis</h2>
              {insufficientDataError ? (
                <div className="header-status insufficient-data">
                  <span className="status-icon">⚠️</span>
                  <span className="status-text">
                    {insufficientDataError.message}
                  </span>
                  <button className="retry-btn" onClick={retryInsufficientData}>
                    🔄 Retry
                  </button>
                </div>
              ) : (isLoading || cacheStatus) && (
                <div className="header-status">
                  {isLoading && <div className="small-spinner"></div>}
                  <span className="status-text">
                    {isLoading ? (
                      <>
                        {currentOperation}
                        {loadingProgress.total > 0 && (
                          <span className="progress-info">
                            {' '}({loadingProgress.current}/{loadingProgress.total})
                          </span>
                        )}
                      </>
                    ) : (
                      cacheStatus
                    )}
                  </span>
                </div>
              )}
            </div>
            {hasActiveFilters() && (
              <div className="current-filters">
                {activeFilters.items.map(item => (
                  <span key={item} className="filter-tag">
                    Item: {item}
                  </span>
                ))}
                {activeFilters.basetypes.length > 0 && (
                  <span className="filter-tag">
                    Basetypes: {activeFilters.basetypes.length} selected
                  </span>
                )}
                {activeFilters.modifiers.map(modifier => (
                  <span key={modifier} className="filter-tag">
                    Modifier: {modifier}
                  </span>
                ))}
                {activeFilters.skills.map(skill => (
                  <span key={skill} className="filter-tag">
                    Skill: {skill}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="header-right">
            {hasActiveFilters() && (
              <button className="clear-filters-btn" onClick={handleClearFilters}>
                Clear Filters
              </button>
            )}
            <button 
              className={`debug-toggle-btn ${debugPanelOpen ? 'active' : ''}`} 
              onClick={toggleDebugPanel}
              title="Toggle Debug Panel"
            >
              🐛 Debug
            </button>
            <button className="overlay-close" onClick={onClose}>×</button>
          </div>
        </div>
        
        <div className="overlay-columns">
            {/* Column 1: Items */}
            <div className="overlay-column">
              <div className="column-header">
                <h3>Items</h3>
                {activeFilters.items.length > 0 && (
                  <button className="unselect-button" onClick={() => setActiveFilters(prev => ({...prev, items: []}))}>
                    Unselect Item
                  </button>
                )}
              </div>
              <div className="column-content">
                {processedData?.items?.map((dimension, dimIndex) => (
                  <div key={dimIndex} className="dimension-section">
                    {dimension.data.map((item, index) => (
                      <div
                        key={index}
                        className={`data-item clickable ${activeFilters.items.includes(item.name) ? 'selected-skill' : ''}`}
                        onClick={() => handleItemClick(item)}
                      >
                        <span className="item-name">{item.name}</span>
                        <span className="item-count">{item.count}</span>
                        <span className="item-percentage">{item.percentage}%</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: Item Basetypes */}
            <div className="overlay-column">
              <div className="column-header">
                <h3>Item Basetypes</h3>
                {activeFilters.basetypes.length > 0 && !pendingSelections && (
                  <button className="unselect-button" onClick={() => setActiveFilters(prev => ({...prev, basetypes: []}))}>
                    Unselect Group
                  </button>
                )}
                {pendingSelections && (
                  <button className="unselect-button" onClick={resetToTopSix}>
                    Reset to Top 6
                  </button>
                )}
              </div>
              <div className="column-content" style={{ position: 'relative', paddingBottom: pendingSelections ? '80px' : '0' }}>
                {activeFilters.items.length > 0 ? (
                  <>
                    {processedData?.itembasetypes?.map((dimension, dimIndex) => {
                      const basetypeData = extractBasetypeData(parentCallData || processedData)

                      return (
                        <div key={dimIndex} className="dimension-section">
                          {dimension.data.map((group, index) => {
                            const isExpanded = expandedGroups.has(group.groupKey)
                            const isInSelectionMode = pendingSelections?.groupKey === group.groupKey
                            const nestedItems = basetypeData?.groupItems?.[group.attribute] || []

                            return (
                              <div key={index} className="group-container">
                                {/* Group Header Row */}
                                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                                  {/* Expand/Collapse Button */}
                                  <button
                                    className="expand-button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleGroupExpansion(group.groupKey)
                                    }}
                                  >
                                    {isExpanded ? '▼' : '▶'}
                                  </button>

                                  {/* Group Card (clickable) */}
                                  <div
                                    className={`data-item group-item ${group.isSelected ? 'selected-skill' : ''} clickable`}
                                    onClick={() => handleGroupClick(group)}
                                    style={{ display: 'flex', flex: 1, alignItems: 'center', gap: '10px', margin: 0 }}
                                  >
                                    <span className="item-name">{group.name}</span>
                                    <span className="item-count">{group.count}</span>
                                    <span className="item-percentage">{group.percentage}%</span>
                                  </div>
                                </div>

                                {/* Nested List */}
                                {isExpanded && nestedItems.length > 0 && (
                                  <div className="nested-basetype-list" style={{
                                    marginLeft: '30px',
                                    borderLeft: '2px solid #374151',
                                    paddingLeft: '10px'
                                  }}>
                                    {nestedItems.map((basetype, btIndex) => {
                                      const isSelected = isInSelectionMode && pendingSelections.items.includes(basetype.name)

                                      return (
                                        <div
                                          key={btIndex}
                                          className={`data-item nested-item ${isSelected ? 'selected-skill' : ''}`}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleBasetypeToggle(basetype.name, group.groupKey, basetypeData.category, group.attribute)
                                          }}
                                          style={{
                                            cursor: 'pointer'
                                          }}
                                        >
                                          <span className="item-name" style={{ flex: 1 }}>{basetype.name}</span>
                                          <span className="item-count">{basetype.count}</span>
                                          <span className="item-percentage">{basetype.percentageOfGroup}%</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}

                    {/* Apply/Cancel Bar */}
                    {pendingSelections && pendingSelections.dimension === 'basetypes' && (() => {
                      // Check if pending selection differs from active filters
                      const pendingDifferent = JSON.stringify(pendingSelections.items.sort()) !== JSON.stringify(activeFilters.basetypes.sort())

                      if (pendingDifferent) {
                        return (
                          <div className="pending-action-bar" style={{
                            position: 'sticky',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: '#1f2937',
                            borderTop: '2px solid #f59e0b',
                            padding: '12px 16px',
                            zIndex: 10
                          }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                              <div style={{ color: '#f59e0b', fontSize: '14px', fontWeight: 'bold' }}>
                                ⚠ {pendingSelections.items.length} basetype{pendingSelections.items.length !== 1 ? 's' : ''} selected (pending)
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={applyPendingSelections}
                                  style={{
                                    background: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                  }}
                                >
                                  Apply Changes
                                </button>
                                <button
                                  onClick={cancelPendingSelections}
                                  style={{
                                    background: '#6b7280',
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()}
                  </>
                ) : (
                  <div className="placeholder-text" style={{padding: '40px 20px', textAlign: 'center', color: '#9ca3af'}}>
                    Select an item to view basetypes
                  </div>
                )}
              </div>
            </div>

            {/* Column 3: Item Modifiers */}
            <div className="overlay-column">
              <div className="column-header">
                <h3>Item Modifiers</h3>
              </div>
              <div className="column-content">
                {activeFilters.items.length > 0 ? (
                  processedData?.itemmods?.map((dimension, dimIndex) => (
                    <div key={dimIndex} className="dimension-section">
                      {dimension.data.map((item, index) => (
                        <div
                          key={index}
                          className={`data-item clickable ${activeFilters.modifiers.includes(item.name) ? 'selected-skill' : ''}`}
                          onClick={() => handleModifierClick(item)}
                        >
                          <span className="item-name">{item.name}</span>
                          <span className="item-count">{item.count}</span>
                          <span className="item-percentage">{item.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <div className="placeholder-text" style={{padding: '40px 20px', textAlign: 'center', color: '#9ca3af'}}>
                    Select an item to view modifiers
                  </div>
                )}
              </div>
            </div>

            {/* Column 4: Skills */}
            <div className="overlay-column">
              <div className="column-header">
                <h3>Skills</h3>
              </div>
              <div className="column-content">
                {processedData?.skills?.map((dimension, dimIndex) => (
                  <div key={dimIndex} className="dimension-section">
                    {dimension.data.map((item, index) => (
                      <div
                        key={index}
                        className={`data-item clickable ${activeFilters.skills.includes(item.name) ? 'selected-skill' : ''}`}
                        onClick={() => handleSkillClick(item)}
                      >
                        <span className="item-name">{item.name}</span>
                        <span className="item-count">{item.count}</span>
                        <span className="item-percentage">{item.percentage}%</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
        </div>
        
        {/* Debug Panel */}
        {debugPanelOpen && (
          <div className="debug-panel">
            <div className="debug-header">
              <h3>🐛 Debug Panel</h3>
              <div className="debug-tabs">
                <button 
                  className={`debug-tab ${debugActiveTab === 'dimensions' ? 'active' : ''}`}
                  onClick={() => setDebugActiveTab('dimensions')}
                >
                  Dimensions
                </button>
                <button 
                  className={`debug-tab ${debugActiveTab === 'logs' ? 'active' : ''}`}
                  onClick={() => setDebugActiveTab('logs')}
                >
                  Logs ({debugLogs.length})
                </button>
                <button 
                  className={`debug-tab ${debugActiveTab === 'raw' ? 'active' : ''}`}
                  onClick={() => setDebugActiveTab('raw')}
                >
                  Raw Data
                </button>
              </div>
            </div>
            
            <div className="debug-content">
              {debugActiveTab === 'dimensions' && (
                <div className="debug-dimensions">
                  <h4>Available Dimensions</h4>
                  {processedData ? (
                    <div className="dimensions-grid">
                      {Object.entries(processedData).map(([key, dimensions]) => (
                        <div key={key} className="dimension-category">
                          <h5>{key}</h5>
                          {Array.isArray(dimensions) ? dimensions.map((dim, index) => (
                            <div key={index} className="dimension-card" onClick={() => addDebugLog(`Clicked dimension: ${dim.id}`, 'info', dim)}>
                              <div className="dimension-name">{dim.id}</div>
                              <div className="dimension-stats">
                                {dim.data?.length || 0} items | Total: {dim.total || 0}
                              </div>
                            </div>
                          )) : (
                            <div className="dimension-card">
                              <div className="dimension-name">Non-array data</div>
                              <div className="dimension-stats">Type: {typeof dimensions}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-data">No processed data available</div>
                  )}
                </div>
              )}
              
              {debugActiveTab === 'logs' && (
                <div className="debug-logs">
                  <div className="logs-header">
                    <h4>Debug Logs</h4>
                    <button onClick={() => setDebugLogs([])} className="clear-logs-btn">Clear Logs</button>
                  </div>
                  <div className="logs-list">
                    {debugLogs.map(log => (
                      <div key={log.id} className={`log-entry log-${log.type}`}>
                        <span className="log-time">{log.timestamp}</span>
                        <span className="log-type">[{log.type.toUpperCase()}]</span>
                        <span className="log-message">{log.message}</span>
                        {log.data && (
                          <div className="log-data">
                            <pre>{JSON.stringify(log.data, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    ))}
                    {debugLogs.length === 0 && (
                      <div className="no-logs">No debug logs yet</div>
                    )}
                  </div>
                </div>
              )}
              
              {debugActiveTab === 'raw' && (
                <div className="debug-raw">
                  <h4>Raw Data Inspector</h4>
                  <div className="raw-data-section">
                    <h5>Initial Data</h5>
                    <pre className="json-viewer">{JSON.stringify(initialData, null, 2)}</pre>
                  </div>
                  <div className="raw-data-section">
                    <h5>Dictionaries</h5>
                    <pre className="json-viewer">{JSON.stringify(dictionaries, null, 2)}</pre>
                  </div>
                  <div className="raw-data-section">
                    <h5>Processed Data</h5>
                    <pre className="json-viewer">{JSON.stringify(processedData, null, 2)}</pre>
                  </div>
                  <div className="raw-data-section">
                    <h5>Active Filters</h5>
                    <pre className="json-viewer">{JSON.stringify(activeFilters, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        </div>
      </div>
    
  )
}

export default AnalysisOverlay