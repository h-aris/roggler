import React from 'react'
import './Sidebar.css'

const Sidebar = () => {
  const pages = [
    { name: 'Main Analysis', href: '/', active: true },
    { name: 'Turquoise Test', href: '/turquoise-test', active: false },
  ]

  const tools = [
    { name: 'Dictionary Collector', href: '/dict-collector' },
    { name: 'Raw Data Analysis', href: '/raw-analysis' },
  ]

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        <h3 className="sidebar-title">Roggler</h3>
        
        <div className="sidebar-divider"></div>
        
        <div className="sidebar-section">
          <div className="sidebar-section-title">ANALYSIS TOOLS</div>
          
          {pages.map((page) => (
            <a
              key={page.name}
              href={page.href}
              className={`sidebar-link ${page.active ? 'active' : ''}`}
            >
              {page.name}
            </a>
          ))}
        </div>

        <div className="sidebar-divider"></div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">UTILITIES</div>
          
          {tools.map((tool) => (
            <a
              key={tool.name}
              href={tool.href}
              className="sidebar-link"
            >
              {tool.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Sidebar