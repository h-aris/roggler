import React, { useState, useEffect } from 'react'

// Constants
const RAILWAY_API_BASE = 'https://roggler-production.up.railway.app/api'
const BLACKLISTED_BASETYPES = ['Spiked Gloves']

const usePoeApi = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [currentData, setCurrentData] = useState(null)
  const [dictionaries, setDictionaries] = useState({})
  const [cache, setCache] = useState({})

  // Protobuf decoder is loaded in index.html

  // Wait for protobuf decoder to load
  const waitForProtobuf = async () => {
    let attempts = 0
    while (!window.ProtobufDecoder && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100))
      attempts++
    }
    if (!window.ProtobufDecoder) {
      throw new Error('Failed to load protobuf decoder')
    }
  }


  // Fetch top-level data from POE.ninja API
  const fetchTopLevelData = async (snapshotId) => {
    setLoading(true)
    setError(null)
    
    try {
      const cacheKey = `toplevel_${snapshotId}`
      
      // Check cache first
      if (cache[cacheKey]) {
        console.log('Using cached top-level data for:', cacheKey)
        setCurrentData(cache[cacheKey].data)
        setDictionaries(cache[cacheKey].dictionaries)
        return cache[cacheKey].data
      }
      
      await waitForProtobuf()
      const apiUrl = `https://poe.ninja/poe1/api/builds/${snapshotId}/search?overview=keepers&type=exp`
      const proxyUrl = apiUrl.replace('https://poe.ninja', RAILWAY_API_BASE)
      
      const response = await fetch(proxyUrl)
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} - ${response.statusText}`)
      }
      
      const data = await response.arrayBuffer()
      const decoded = window.ProtobufDecoder.NinjaSearchResult.fromBinary(data)
      
      // Top-level data should always be cached regardless of total count
      // since it's just getting the list of available items
      setCurrentData(decoded)
      
      // Load dictionaries if available
      let loadedDictionaries = {}
      if (decoded.result.dictionaries?.length > 0) {
        loadedDictionaries = await loadDictionaries(decoded.result.dictionaries)
      }
      
      // Cache the result (only if we have sufficient data)
      setCache(prev => ({
        ...prev,
        [cacheKey]: {
          data: decoded,
          dictionaries: loadedDictionaries,
          timestamp: Date.now()
        }
      }))
      
      // Implement cache size limit (keep last 100 entries)
      const cacheEntries = Object.entries(cache)
      if (cacheEntries.length > 100) {
        const sortedEntries = cacheEntries.sort((a, b) => b[1].timestamp - a[1].timestamp)
        const newCache = {}
        sortedEntries.slice(0, 100).forEach(([key, value]) => {
          newCache[key] = value
        })
        setCache(newCache)
      }
      
      return decoded
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Fetch data from POE.ninja API with caching
  const fetchData = async (snapshotId, rareItem) => {
    setLoading(true)
    setError(null)
    
    try {
      const cacheKey = `${snapshotId}_${rareItem}`
      
      // Check cache first
      if (cache[cacheKey]) {
        console.log('Using cached data for:', cacheKey)
        setCurrentData(cache[cacheKey].data)
        setDictionaries(cache[cacheKey].dictionaries)
        return cache[cacheKey].data
      }
      
      await waitForProtobuf()
      const apiUrl = `https://poe.ninja/poe1/api/builds/${snapshotId}/search?items=${encodeURIComponent(rareItem)}&overview=keepers&type=exp`
      const proxyUrl = apiUrl.replace('https://poe.ninja', RAILWAY_API_BASE)
      
      const response = await fetch(proxyUrl)
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} - ${response.statusText}`)
      }
      
      const data = await response.arrayBuffer()
      const decoded = window.ProtobufDecoder.NinjaSearchResult.fromBinary(data)
      
      setCurrentData(decoded)
      
      // Load dictionaries if available
      let loadedDictionaries = {}
      if (decoded.result.dictionaries?.length > 0) {
        loadedDictionaries = await loadDictionaries(decoded.result.dictionaries)
      }
      
      // Cache the result (only if we have sufficient data)
      setCache(prev => ({
        ...prev,
        [cacheKey]: {
          data: decoded,
          dictionaries: loadedDictionaries,
          timestamp: Date.now()
        }
      }))
      
      // Implement cache size limit (keep last 100 entries)
      const cacheEntries = Object.entries(cache)
      if (cacheEntries.length > 100) {
        const sortedEntries = cacheEntries.sort((a, b) => b[1].timestamp - a[1].timestamp)
        const newCache = {}
        sortedEntries.slice(0, 100).forEach(([key, value]) => {
          newCache[key] = value
        })
        setCache(newCache)
      }
      
      return decoded
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Load dictionaries from API
  const loadDictionaries = async (dictionaryRefs) => {
    const newDictionaries = {}
    
    for (const dictRef of dictionaryRefs) {
      try {
        const response = await fetch(`${RAILWAY_API_BASE}/poe1/api/builds/dictionary/${dictRef.hash}`)
        if (response.ok) {
          const dictData = await response.arrayBuffer()
          const dictionary = window.ProtobufDecoder.SearchResultDictionary.fromBinary(dictData)
          newDictionaries[dictRef.id] = {
            values: dictionary.values || [],
            source: 'api'
          }
        }
      } catch (err) {
        console.warn(`Failed to load dictionary ${dictRef.id}:`, err)
      }
    }
    
    setDictionaries(newDictionaries)
    return newDictionaries
  }

  // Fetch data with optional skill filter
  const fetchSkillFilteredData = async (snapshotId, rareItem, skillName) => {
    try {
      await waitForProtobuf()
      
      let apiUrl = `https://poe.ninja/poe1/api/builds/${snapshotId}/search?overview=keepers&type=exp`
      
      // Add rare item if provided
      if (rareItem) {
        apiUrl += `&items=${encodeURIComponent(rareItem)}`
      }
      
      // Add skill filter if provided
      if (skillName) {
        apiUrl += `&skills=${encodeURIComponent(skillName)}`
      }
      
      const proxyUrl = apiUrl.replace('https://poe.ninja', RAILWAY_API_BASE)
      
      const response = await fetch(proxyUrl)
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} - ${response.statusText}`)
      }
      
      const data = await response.arrayBuffer()
      const decoded = window.ProtobufDecoder.NinjaSearchResult.fromBinary(data)
      
      // Load dictionaries for this call
      const dictionaries = await loadDictionariesForCall(decoded)
      
      return { data: decoded, dictionaries }
    } catch (err) {
      throw err
    }
  }

  // Load dictionaries for a specific API call like maintest.html
  const loadDictionariesForCall = async (decoded) => {
    const dictionaries = {}
    
    if (decoded.result.dictionaries && decoded.result.dictionaries.length > 0) {
      for (const dictRef of decoded.result.dictionaries) {
        try {
          const response = await fetch(`${RAILWAY_API_BASE}/poe1/api/builds/dictionary/${dictRef.hash}`)
          if (response.ok) {
            const dictData = await response.arrayBuffer()
            const dictionary = window.ProtobufDecoder.SearchResultDictionary.fromBinary(dictData)
            dictionaries[dictRef.id] = {
              values: dictionary.values || [],
              source: 'api'
            }
          }
        } catch (e) {
          console.warn('Failed to load dictionary:', dictRef.id, e)
        }
      }
    }
    
    return dictionaries
  }

  // Aggregate data across multiple basetypes with optional skill filter
  const aggregateBasetypes = async (snapshotId, category, attribute, basetypes, skillName = null, onProgress = null) => {
    const results = []
    const errors = []
    
    // Filter blacklisted basetypes
    const filteredBasetypes = basetypes.filter(basetype => !BLACKLISTED_BASETYPES.includes(basetype))
    const top6Basetypes = filteredBasetypes.slice(0, 6)
    
    const rareItemTypeMap = {
      'BodyArmour': 'Rare Body Armour',
      'Boots': 'Rare Boots',
      'Gloves': 'Rare Gloves',
      'Helmet': 'Rare Helmet',
      'Shield': 'Rare Shield'
    }
    
    const rareItemType = rareItemTypeMap[category] || `Rare ${category}`
    const dimensionKey = `itembasetypes-${category}`
    
    for (let i = 0; i < top6Basetypes.length; i++) {
      const basetype = top6Basetypes[i]
      
      // Call progress callback if provided
      if (onProgress) {
        onProgress(i, top6Basetypes.length, basetype)
      }
      try {
        let apiUrl = `https://poe.ninja/poe1/api/builds/${snapshotId}/search?items=${encodeURIComponent(rareItemType)}&${dimensionKey}=${encodeURIComponent(basetype)}&overview=keepers&type=exp`
        
        // Add skill filter if provided
        if (skillName) {
          apiUrl += `&skills=${encodeURIComponent(skillName)}`
        }
        
        const proxyUrl = apiUrl.replace('https://poe.ninja', RAILWAY_API_BASE)
        
        const response = await fetch(proxyUrl)
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`)
        }
        
        const data = await response.arrayBuffer()
        const decoded = window.ProtobufDecoder.NinjaSearchResult.fromBinary(data)
        
        // Load dictionaries for this call like maintest.html
        const dictionaries = await loadDictionariesForCall(decoded)
        
        // Calculate true total from secondascendancy
        const secondAscendancyDimension = decoded.result.dimensions?.find(d => d.id === 'secondascendancy')
        const trueTotal = secondAscendancyDimension ? 
          secondAscendancyDimension.counts.reduce((sum, count) => sum + count.count, 0) : 
          decoded.result.total
        
        results.push({
          basetype,
          data: decoded,
          dictionaries,
          trueTotal
        })
        
        // Call progress callback for completion
        if (onProgress) {
          onProgress(i + 1, top6Basetypes.length, basetype)
        }
      } catch (err) {
        errors.push({ basetype, error: err.message })
        
        // Still call progress callback on error
        if (onProgress) {
          onProgress(i + 1, top6Basetypes.length, basetype)
        }
      }
    }
    
    return { results, errors, skipped: basetypes.filter(bt => BLACKLISTED_BASETYPES.includes(bt)) }
  }

  // Process dimension data with dictionaries
  const processDimension = (dimension, dictionaries, trueTotal = null) => {
    // Use dimension.dictionaryId like maintest.html
    const dictionaryId = dimension.dictionaryId
    const dictionary = dictionaries[dictionaryId]
    if (!dictionary) return null
    
    // Use provided trueTotal or fall back to currentData total
    const total = trueTotal || (currentData?.result ? 
      (currentData.result.dimensions?.find(d => d.id === 'secondascendancy')?.counts?.reduce((sum, count) => sum + count.count, 0) || currentData.result.total) 
      : dimension.total)
    
    const processedData = dimension.counts.map(count => ({
      key: count.key,
      name: dictionary.values[count.key] || `Key_${count.key}`,
      count: count.count,
      percentage: ((count.count / total) * 100).toFixed(1),
      resolved: !!dictionary.values[count.key]
    }))
    
    return {
      id: dimension.id,
      dictionaryId,
      total: total,
      data: processedData.sort((a, b) => b.count - a.count)
    }
  }

  return {
    loading,
    error,
    currentData,
    dictionaries,
    fetchData,
    fetchTopLevelData,
    loadDictionaries,
    aggregateBasetypes,
    processDimension,
    fetchSkillFilteredData,
    setError
  }
}

export default usePoeApi