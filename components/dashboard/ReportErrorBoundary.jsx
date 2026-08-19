'use client'

import { Component } from 'react'

/**
 * Catches rendering-phase errors inside the Health Report export area
 * (PCODRiskCard and its children) and shows a fallback UI instead of
 * letting the crash take down the whole page.
 *
 * This is separate from the try/catch inside handleExport, which only
 * catches errors from the async generateReport() call itself. This
 * boundary catches anything that goes wrong while React is actually
 * rendering the card — e.g. bad data causing a child component to throw.
 */
export default class ReportErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ReportErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="risk-card glass" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-faint)' }}>
            Something went wrong showing your health report. Please refresh the page.
          </p>
        </div>
      )
    }

    return this.props.children
  }
}