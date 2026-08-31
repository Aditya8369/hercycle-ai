'use client'

import { useState, useMemo } from 'react'
import {
  Search, Filter, Star, Heart, ShoppingCart, ArrowRight, BarChart3,
  TrendingUp, TrendingDown, DollarSign, Leaf, Shield, Clock, Award,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Package, Truck,
  Recycle, Droplets, Sun, AlertTriangle, Info, Bookmark, Share2,
  Plus, Minus, RefreshCw, Calendar, Zap, ThumbsUp, ThumbsDown,
  ExternalLink, Scale, Sparkles
} from 'lucide-react'

// ─── Product Data ─────────────────────────────────────────────────

const PRODUCT_TYPES = [
  { id: 'pads', name: 'Pads', icon: '🩹', color: '#ec4899', count: 12 },
  { id: 'tampons', name: 'Tampons', icon: '🎀', color: '#f472b6', count: 8 },
  { id: 'cups', name: 'Menstrual Cups', icon: '🥤', color: '#a855f7', count: 6 },
  { id: 'discs', name: 'Menstrual Discs', icon: '⭕', color: '#8b5cf6', count: 4 },
  { id: 'underwear', name: 'Period Underwear', icon: ' panties', color: '#6366f1', count: 5 },
  { id: 'cloth', name: 'Cloth Pads', icon: '🧵', color: '#10b981', count: 4 },
  { id: 'sponges', name: 'Sea Sponges', icon: '🧽', color: '#14b8a6', count: 2 },
  { id: 'supplements', name: 'Supplements', icon: '💊', color: '#f59e0b', count: 6 }
]

const PRODUCTS = [
  {
    id: 1, name: 'Flex Cup', type: 'cups', brand: 'Flex',
    rating: 4.6, reviews: 342, price: 16.99, monthlyCost: 1.42,
    capacity: '30ml', duration: '12 hours', sizes: ['Small', 'Regular', 'Large'],
    features: ['Reusable', 'Medical-grade silicone', 'Pull-tab removal', 'FSA/HSA eligible'],
    pros: ['Easy removal with pull tab', 'Soft and flexible', 'Great for beginners'],
    cons: ['Slightly more expensive', 'Learning curve initially'],
    ecoScore: 92, comfortScore: 88, valueScore: 85, easeScore: 78,
    leakProtection: 90, bestFor: 'Beginners switching from tampons',
    material: 'Medical-grade silicone', whereToBuy: 'Amazon, Target, Flex website',
    monthlyCycleUse: 5, reusable: true, lifespan: '10 years',
    color: '#a855f7', sustainable: true
  },
  {
    id: 2, name: 'DivaCup', type: 'cups', brand: 'Diva',
    rating: 4.3, reviews: 1256, price: 29.99, monthlyCost: 0.50,
    capacity: '30ml', duration: '12 hours', sizes: ['Model 1', 'Model 2'],
    features: ['Reusable', 'Medical-grade silicone', 'Pre-measurement markings', 'Boil to sterilize'],
    pros: ['Widely available', 'Trusted brand', 'Good capacity'],
    cons: ['Firm rim can be uncomfortable', 'Trim stem needed for some'],
    ecoScore: 90, comfortScore: 75, valueScore: 95, easeScore: 65,
    leakProtection: 88, bestFor: 'Experienced cup users',
    material: 'Medical-grade silicone', whereToBuy: 'Most pharmacies, Amazon',
    monthlyCycleUse: 5, reusable: true, lifespan: '1 year',
    color: '#ec4899', sustainable: true
  },
  {
    id: 3, name: 'Always Ultra Thin', type: 'pads', brand: 'Always',
    rating: 4.1, reviews: 2890, price: 8.99, monthlyCost: 8.99,
    capacity: 'Varies by size', duration: '4-6 hours', sizes: ['Regular', 'Long', 'Overnight', 'Panty Liner'],
    features: ['Individually wrapped', 'Wings available', 'Odor control', 'RapidDry core'],
    pros: ['Readily available', 'Comfortable fit', 'Multiple absorbency levels'],
    cons: ['Creates waste', 'Monthly recurring cost', 'Plastic-based'],
    ecoScore: 15, comfortScore: 72, valueScore: 60, easeScore: 95,
    leakProtection: 78, bestFor: 'Those who prefer disposable convenience',
    material: 'Polyethylene, polypropylene', whereToBuy: 'Any pharmacy or store',
    monthlyCycleUse: 20, reusable: false, lifespan: 'Single use',
    color: '#ec4899', sustainable: false
  },
  {
    id: 4, name: 'Thinx Period Underwear', type: 'underwear', brand: 'Thinx',
    rating: 4.4, reviews: 1567, price: 34.00, monthlyCost: 5.67,
    capacity: '2-4 tampons worth', duration: 'Full day', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    features: ['Reusable', 'Washable', 'Moisture-wicking', 'Anti-odor technology'],
    pros: ['Feels like normal underwear', 'No insertion needed', 'Great as backup'],
    cons: ['Higher upfront cost', 'Takes time to dry', 'Must wash in cold water'],
    ecoScore: 78, comfortScore: 95, valueScore: 72, easeScore: 98,
    leakProtection: 75, bestFor: 'Those wanting a comfortable, no-fuss option',
    material: 'Modal, cotton, elastane', whereToBuy: 'Thinx website, Target',
    monthlyCycleUse: 6, reusable: true, lifespan: '2 years',
    color: '#6366f1', sustainable: true
  },
  {
    id: 5, name: 'Organyc 100% Organic', type: 'pads', brand: 'Organyc',
    rating: 4.2, reviews: 456, price: 9.49, monthlyCost: 9.49,
    capacity: 'Regular to Heavy', duration: '4-6 hours', sizes: ['Normal', 'Night', 'Panty Liner'],
    features: ['100% organic cotton', 'Biodegradable', 'Chlorine-free', 'Individually wrapped'],
    pros: ['Chemical-free', 'Hypoallergenic', 'Biodegradable packaging'],
    cons: ['Less absorbent than synthetics', 'More expensive', 'Limited availability'],
    ecoScore: 65, comfortScore: 80, valueScore: 50, easeScore: 92,
    leakProtection: 70, bestFor: 'Those with sensitive skin or allergies',
    material: '100% organic cotton', whereToBuy: 'Amazon, health stores',
    monthlyCycleUse: 18, reusable: false, lifespan: 'Single use',
    color: '#10b981', sustainable: true
  },
  {
    id: 6, name: 'June Cup', type: 'cups', brand: 'June',
    rating: 4.7, reviews: 890, price: 6.99, monthlyCost: 0.12,
    capacity: '28ml', duration: '12 hours', sizes: ['Small', 'Large'],
    features: ['Reusable', 'Medical-grade silicone', 'Very affordable', 'Includes sterilizer cup'],
    pros: ['Incredibly affordable', 'Soft silicone', 'Great for beginners'],
    cons: ['Limited sizes', 'Less brand recognition', 'Firmness may vary'],
    ecoScore: 95, comfortScore: 85, valueScore: 99, easeScore: 80,
    leakProtection: 85, bestFor: 'Budget-conscious beginners',
    material: 'Medical-grade silicone', whereToBuy: 'June website, Amazon',
    monthlyCycleUse: 5, reusable: true, lifespan: '10 years',
    color: '#f59e0b', sustainable: true
  },
  {
    id: 7, name: 'Saalt Soft Cup', type: 'cups', brand: 'Saalt',
    rating: 4.5, reviews: 1023, price: 27.99, monthlyCost: 0.47,
    capacity: '25ml', duration: '12 hours', sizes: ['Small', 'Regular'],
    features: ['Reusable', 'Soft silicone', 'No latex, BPA, or dyes', 'Period-positive brand'],
    pros: ['Extra soft for敏感 users', 'Great customer service', 'Donates products to those in need'],
    cons: ['Slightly lower capacity', 'Premium price'],
    ecoScore: 91, comfortScore: 92, valueScore: 82, easeScore: 75,
    leakProtection: 83, bestFor: 'Those with a sensitive cervix',
    material: 'Soft silicone', whereToBuy: 'Saalt website, Target, Amazon',
    monthlyCycleUse: 5, reusable: true, lifespan: '10 years',
    color: '#a855f7', sustainable: true
  },
  {
    id: 8, name: 'Tampax Pearl', type: 'tampons', brand: 'Tampax',
    rating: 4.0, reviews: 3456, price: 7.49, monthlyCost: 7.49,
    capacity: 'Regular to Super Plus', duration: '4-6 hours', sizes: ['Light', 'Regular', 'Super', 'Super Plus'],
    features: ['Applicator tampon', 'LeakGuard braid', 'Reclosable wrapper', 'Smooth removal'],
    pros: ['Easy to insert', 'Widely available', 'Reliable protection'],
    cons: ['Single-use plastic', 'Risk of TSS with extended use', 'Monthly cost adds up'],
    ecoScore: 10, comfortScore: 74, valueScore: 55, easeScore: 90,
    leakProtection: 82, bestFor: 'Tampon users wanting reliable everyday protection',
    material: 'Rayon, cotton blend', whereToBuy: 'Any pharmacy or store',
    monthlyCycleUse: 15, reusable: false, lifespan: 'Single use',
    color: '#f472b6', sustainable: false
  },
  {
    id: 9, name: 'Modibodi Sensation', type: 'underwear', brand: 'Modibodi',
    rating: 4.5, reviews: 789, price: 32.00, monthlyCost: 5.33,
    capacity: '3 tampons worth', duration: 'Full day', sizes: ['4', '6', '8', '10', '12', '14', '16'],
    features: ['Reusable', 'Meritano™ technology', 'Anti-odour', 'Breathable'],
    pros: ['Excellent absorbency', 'Wide size range', 'Comfortable for all-day wear'],
    cons: ['Higher price', 'Heavier when wet', 'Limited style options'],
    ecoScore: 76, comfortScore: 93, valueScore: 70, easeScore: 96,
    leakProtection: 80, bestFor: 'Those wanting premium period underwear',
    material: 'Meritano™ merino wool blend', whereToBuy: 'Modibodi website, Amazon',
    monthlyCycleUse: 5, reusable: true, lifespan: '2 years',
    color: '#6366f1', sustainable: true
  },
  {
    id: 10, name: 'Lena Cup', type: 'cups', brand: 'Lena',
    rating: 4.4, reviews: 678, price: 19.99, monthlyCost: 0.33,
    capacity: '25ml', duration: '12 hours', sizes: ['Small', 'Large'],
    features: ['Reusable', 'Medical-grade silicone', 'Soft rim', 'Beginner-friendly'],
    pros: ['Very soft and comfortable', 'Good beginner option', 'Affordable'],
    cons: ['Lower capacity than some', 'May need emptying more often on heavy days'],
    ecoScore: 93, comfortScore: 90, valueScore: 88, easeScore: 82,
    leakProtection: 82, bestFor: 'First-time cup users wanting comfort',
    material: 'Medical-grade silicone', whereToBuy: 'Lena website, Amazon',
    monthlyCycleUse: 5, reusable: true, lifespan: '10 years',
    color: '#10b981', sustainable: true
  }
]

const SUBSCRIPTIONS = [
  { id: 1, product: 'Always Ultra Thin Long (28ct)', brand: 'Always', cost: 8.99, frequency: 'Monthly', nextDelivery: '2025-09-15', status: 'active', icon: '🩹' },
  { id: 2, product: 'Thinx Air (2-pack)', brand: 'Thinx', cost: 54.00, frequency: 'Every 6 months', nextDelivery: '2025-12-01', status: 'active', icon: ' panties' },
  { id: 3, product: 'Saalt Soft Cup (2-pack)', brand: 'Saalt', cost: 27.99, frequency: 'Yearly', nextDelivery: '2026-06-15', status: 'paused', icon: '🥤' }
]

const REVIEWS = [
  { user: 'Sarah M.', avatar: '👩‍🦰', rating: 5, product: 'Flex Cup', title: 'Life-changing!', text: 'Switched from tampons and never looked back. The pull tab makes removal so easy.', helpful: 234, time: '2 weeks ago', verified: true },
  { user: 'Priya K.', avatar: '👩', rating: 4, product: 'DivaCup', title: 'Great but firm', text: 'Love the capacity and eco-friendliness. The rim is a bit firm for me but I got used to it.', helpful: 189, time: '1 month ago', verified: true },
  { user: 'Emma L.', avatar: '👩‍🦱', rating: 5, product: 'Thinx', title: 'My go-to backup', text: 'Use these as backup with my cup. Super comfortable and I forget I\'m on my period.', helpful: 156, time: '3 weeks ago', verified: true },
  { user: 'Lisa R.', avatar: '👩‍🦳', rating: 4, product: 'June Cup', title: 'Best budget option', text: 'At $7, you can\'t beat this. Works just as well as cups 4x the price.', helpful: 178, time: '2 months ago', verified: true },
  { user: 'Kelly B.', avatar: '👩‍🦲', rating: 5, product: 'Saalt Soft Cup', title: 'Perfect for sensitive users', text: 'If other cups were uncomfortable, try this one. Softer than any cup I\'ve tried.', helpful: 145, time: '1 month ago', verified: true }
]

// ─── Sub-Components ───────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, color, sub }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '20px',
      border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '14px'
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px',
        background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <Icon size={24} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: '#fff' }}>{value}</div>
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>{label}</div>
        {sub && <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>{sub}</div>}
      </div>
    </div>
  )
}

function StarRating({ rating, size = 14 }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={size} fill={i <= Math.round(rating) ? '#f59e0b' : 'none'}
          color={i <= Math.round(rating) ? '#f59e0b' : '#334155'} />
      ))}
    </div>
  )
}

function ScoreBar({ label, value, max = 100, color }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color }}>{value}/100</span>
      </div>
      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
    </div>
  )
}

function ProductCard({ product, onCompare, isCompared, onSelect }) {
  return (
    <div onClick={() => onSelect(product)} style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
      border: isCompared ? `1px solid ${product.color}60` : '1px solid rgba(255,255,255,0.06)',
      padding: '20px', cursor: 'pointer', transition: 'all 0.2s',
      position: 'relative', overflow: 'hidden'
    }}>
      {product.sustainable && (
        <div style={{
          position: 'absolute', top: '12px', right: '12px',
          background: '#10b98120', color: '#10b981', fontSize: '10px',
          padding: '3px 8px', borderRadius: '6px', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '4px'
        }}><Leaf size={10} /> Eco-Friendly</div>
      )}
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px',
        background: `${product.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '24px', marginBottom: '12px'
      }}>{PRODUCT_TYPES.find(t => t.id === product.type)?.icon}</div>
      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>{product.brand}</div>
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>{product.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <StarRating rating={product.rating} />
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{product.rating} ({product.reviews})</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>${product.price}</div>
        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
          ${product.monthlyCost.toFixed(2)}/mo
          {product.reusable && <span style={{ color: '#10b981' }}> (saves money!)</span>}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
        {product.features.slice(0, 3).map(f => (
          <span key={f} style={{
            fontSize: '10px', padding: '3px 6px', borderRadius: '6px',
            background: 'rgba(255,255,255,0.05)', color: '#94a3b8'
          }}>{f}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#64748b' }}>
        <span>💧 {product.capacity}</span>
        <span>⏱️ {product.duration}</span>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onCompare(product.id) }} style={{
        width: '100%', marginTop: '12px', padding: '8px',
        background: isCompared ? `${product.color}20` : 'rgba(255,255,255,0.05)',
        border: isCompared ? `1px solid ${product.color}40` : '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px', color: isCompared ? product.color : '#94a3b8',
        fontSize: '12px', fontWeight: 600, cursor: 'pointer'
      }}>{isCompared ? '✓ Comparing' : '+ Compare'}</button>
    </div>
  )
}

function CompareTable({ products }) {
  if (products.length < 2) return null
  const metrics = [
    { key: 'price', label: 'Price', format: p => `$${p.price}` },
    { key: 'monthlyCost', label: 'Monthly Cost', format: p => `$${p.monthlyCost.toFixed(2)}` },
    { key: 'ecoScore', label: 'Eco Score', format: p => `${p.ecoScore}/100`, bar: true, color: '#10b981' },
    { key: 'comfortScore', label: 'Comfort', format: p => `${p.comfortScore}/100`, bar: true, color: '#ec4899' },
    { key: 'valueScore', label: 'Value', format: p => `${p.valueScore}/100`, bar: true, color: '#6366f1' },
    { key: 'easeScore', label: 'Ease of Use', format: p => `${p.easeScore}/100`, bar: true, color: '#f59e0b' },
    { key: 'leakProtection', label: 'Leak Protection', format: p => `${p.leakProtection}/100`, bar: true, color: '#06b6d4' },
    { key: 'capacity', label: 'Capacity', format: p => p.capacity },
    { key: 'duration', label: 'Wear Time', format: p => p.duration },
    { key: 'rating', label: 'Rating', format: p => `${p.rating} ⭐ (${p.reviews} reviews)` },
    { key: 'lifespan', label: 'Lifespan', format: p => p.lifespan }
  ]
  return (
    <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{
              textAlign: 'left', padding: '12px 16px', fontSize: '13px', fontWeight: 600,
              color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.08)', minWidth: '160px'
            }}>Metric</th>
            {products.map(p => (
              <th key={p.id} style={{
                textAlign: 'center', padding: '12px 16px', fontSize: '13px', fontWeight: 700,
                color: p.color, borderBottom: `2px solid ${p.color}40`
              }}>
                <div>{p.brand}</div>
                <div style={{ fontSize: '14px', color: '#fff' }}>{p.name}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, i) => (
            <tr key={m.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '10px 16px', fontSize: '13px', color: '#94a3b8' }}>{m.label}</td>
              {products.map(p => (
                <td key={p.id} style={{ padding: '10px 16px', textAlign: 'center', fontSize: '13px' }}>
                  {m.bar ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '80%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px' }}>
                        <div style={{ width: `${p[m.key]}%`, height: '100%', background: m.color, borderRadius: '3px' }} />
                      </div>
                      <span style={{ fontSize: '12px', color: '#cbd5e1' }}>{p[m.key]}</span>
                    </div>
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>{m.format(p)}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────

export default function ProductComparison() {
  const [activeTab, setActiveTab] = useState('products')
  const [selectedType, setSelectedType] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [compareList, setCompareList] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [sortBy, setSortBy] = useState('rating')
  const [showAddSub, setShowAddSub] = useState(false)

  const tabs = [
    { id: 'products', label: 'Products', icon: Package },
    { id: 'compare', label: 'Compare', icon: BarChart3 },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'subscriptions', label: 'Subscriptions', icon: RefreshCw },
    { id: 'cost', label: 'Cost Calculator', icon: DollarSign }
  ]

  const filteredProducts = useMemo(() => {
    let prods = [...PRODUCTS]
    if (selectedType !== 'all') prods = prods.filter(p => p.type === selectedType)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      prods = prods.filter(p => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.features.some(f => f.toLowerCase().includes(q)))
    }
    if (sortBy === 'rating') prods.sort((a, b) => b.rating - a.rating)
    if (sortBy === 'price-low') prods.sort((a, b) => a.price - b.price)
    if (sortBy === 'price-high') prods.sort((a, b) => b.price - a.price)
    if (sortBy === 'eco') prods.sort((a, b) => b.ecoScore - a.ecoScore)
    if (sortBy === 'monthly') prods.sort((a, b) => a.monthlyCost - b.monthlyCost)
    if (sortBy === 'reviews') prods.sort((a, b) => b.reviews - a.reviews)
    return prods
  }, [selectedType, searchQuery, sortBy])

  const compareProducts = useMemo(() => PRODUCTS.filter(p => compareList.includes(p.id)), [compareList])

  const toggleCompare = (id) => {
    setCompareList(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev)
  }

  const annualSavings = useMemo(() => {
    const disposable = PRODUCTS.filter(p => !p.reusable && p.type !== 'supplements')
    const reusable = PRODUCTS.filter(p => p.reusable)
    const avgDisposable = disposable.reduce((s, p) => s + p.monthlyCost * 12, 0) / disposable.length
    const avgReusable = reusable.reduce((s, p) => s + p.monthlyCost * 12, 0) / reusable.length
    return { disposable: avgDisposable.toFixed(0), reusable: avgReusable.toFixed(0), saved: (avgDisposable - avgReusable).toFixed(0) }
  }, [])

  const wasteStats = useMemo(() => {
    const disposable = PRODUCTS.filter(p => !p.reusable)
    const avgLifespan = 10 // years
    const itemsPerCycle = 20
    const cyclesPerYear = 13
    return {
      disposablePerYear: itemsPerCycle * cyclesPerYear,
      lifetimeWaste: itemsPerCycle * cyclesPerYear * avgLifespan,
      reusableSavings: `${itemsPerCycle * cyclesPerYear * avgLifespan} items avoided`
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#fff', padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 8px' }}>
            🛒 Period Product Guide
          </h1>
          <p style={{ fontSize: '16px', color: '#94a3b8', margin: '0' }}>
            Compare products, read reviews, track subscriptions, and find the best fit for your cycle
          </p>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
          <KPICard icon={Package} label="Products Reviewed" value={PRODUCTS.length.toString()} color="#6366f1" />
          <KPICard icon={Leaf} label="Eco-Friendly Options" value={PRODUCTS.filter(p => p.sustainable).length.toString()} color="#10b981" />
          <KPICard icon={DollarSign} label="Avg Monthly Cost" value={`$${(PRODUCTS.reduce((s,p) => s+p.monthlyCost, 0)/PRODUCTS.length).toFixed(2)}`} color="#f59e0b" />
          <KPICard icon={Recycle} label="Waste Avoided/Year" value={`${wasteStats.disposablePerYear} items`} color="#8b5cf6" sub="With reusable products" />
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)',
          borderRadius: '14px', padding: '4px', marginBottom: '24px',
          border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto'
        }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedProduct(null) }} style={{
              flex: 1, padding: '10px 16px', borderRadius: '10px',
              background: activeTab === tab.id ? '#6366f1' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#94a3b8',
              border: 'none', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap',
              transition: 'all 0.2s'
            }}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ Products Tab ═══ */}
        {activeTab === 'products' && !selectedProduct && (
          <>
            {/* Filters */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{
                flex: 1, minWidth: '250px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px',
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px',
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                <Search size={16} color="#64748b" />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search products, brands, features..."
                  style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: '13px', outline: 'none' }} />
              </div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: '12px',
                padding: '10px 14px', color: '#fff', border: '1px solid rgba(255,255,255,0.08)',
                fontSize: '13px', outline: 'none', cursor: 'pointer'
              }}>
                <option value="rating">⭐ Top Rated</option>
                <option value="price-low">💰 Price: Low→High</option>
                <option value="price-high">💰 Price: High→Low</option>
                <option value="eco">🌿 Most Eco-Friendly</option>
                <option value="monthly">📅 Lowest Monthly Cost</option>
                <option value="reviews">💬 Most Reviews</option>
              </select>
            </div>
            {/* Type filter pills */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <button onClick={() => setSelectedType('all')} style={{
                padding: '8px 14px', borderRadius: '10px',
                background: selectedType === 'all' ? '#6366f120' : 'rgba(255,255,255,0.03)',
                border: selectedType === 'all' ? '1px solid #6366f140' : '1px solid rgba(255,255,255,0.06)',
                color: selectedType === 'all' ? '#818cf8' : '#94a3b8',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer'
              }}>All ({PRODUCTS.length})</button>
              {PRODUCT_TYPES.map(t => (
                <button key={t.id} onClick={() => setSelectedType(t.id)} style={{
                  padding: '8px 14px', borderRadius: '10px',
                  background: selectedType === t.id ? `${t.color}20` : 'rgba(255,255,255,0.03)',
                  border: selectedType === t.id ? `1px solid ${t.color}40` : '1px solid rgba(255,255,255,0.06)',
                  color: selectedType === t.id ? t.color : '#94a3b8',
                  fontSize: '12px', fontWeight: 500, cursor: 'pointer'
                }}>{t.icon} {t.name}</button>
              ))}
            </div>
            {/* Compare bar */}
            {compareList.length >= 2 && (
              <div style={{
                background: 'linear-gradient(135deg, #6366f115, #8b5cf615)',
                borderRadius: '14px', padding: '14px 20px', marginBottom: '20px',
                border: '1px solid #6366f130', display: 'flex', alignItems: 'center', gap: '12px'
              }}>
                <BarChart3 size={18} color="#6366f1" />
                <span style={{ fontSize: '14px', fontWeight: 600 }}>{compareList.length} products selected</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => setActiveTab('compare')} style={{
                  padding: '8px 16px', borderRadius: '8px', background: '#6366f1',
                  color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}>Compare Now →</button>
                <button onClick={() => setCompareList([])} style={{
                  padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)',
                  color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: '13px', cursor: 'pointer'
                }}>Clear</button>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {filteredProducts.map(p => (
                <ProductCard key={p.id} product={p} onSelect={setSelectedProduct}
                  isCompared={compareList.includes(p.id)} onCompare={toggleCompare} />
              ))}
            </div>
          </>
        )}

        {/* ═══ Product Detail ═══ */}
        {activeTab === 'products' && selectedProduct && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <button onClick={() => setSelectedProduct(null)} style={{
              background: 'none', border: 'none', color: '#6366f1',
              fontSize: '13px', cursor: 'pointer', marginBottom: '16px'
            }}>← Back to products</button>
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '20px',
              padding: '32px', border: `1px solid ${selectedProduct.color}30`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '16px',
                  background: `${selectedProduct.color}15`, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '32px'
                }}>{PRODUCT_TYPES.find(t => t.id === selectedProduct.type)?.icon}</div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{selectedProduct.brand}</div>
                  <div style={{ fontSize: '22px', fontWeight: 800 }}>{selectedProduct.name}</div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <StarRating rating={selectedProduct.rating} size={16} />
                    <span style={{ fontSize: '14px', color: '#94a3b8' }}>{selectedProduct.rating} ({selectedProduct.reviews} reviews)</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#10b981' }}>${selectedProduct.price}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>One-time cost</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b' }}>${selectedProduct.monthlyCost.toFixed(2)}/mo</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>Equivalent monthly cost</div>
                </div>
              </div>
              <ScoreBar label="🌿 Eco Score" value={selectedProduct.ecoScore} color="#10b981" />
              <ScoreBar label="☁️ Comfort" value={selectedProduct.comfortScore} color="#ec4899" />
              <ScoreBar label="💎 Value for Money" value={selectedProduct.valueScore} color="#6366f1" />
              <ScoreBar label="🎯 Ease of Use" value={selectedProduct.easeScore} color="#f59e0b" />
              <ScoreBar label="🛡️ Leak Protection" value={selectedProduct.leakProtection} color="#06b6d4" />
              <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#10b981', margin: '0 0 8px' }}>✅ Pros</h4>
                  {selectedProduct.pros.map((p, i) => (
                    <div key={i} style={{ fontSize: '13px', color: '#cbd5e1', padding: '4px 0', display: 'flex', gap: '6px' }}>
                      <CheckCircle size={14} color="#10b981" style={{ marginTop: '2px', flexShrink: 0 }} /> {p}
                    </div>
                  ))}
                </div>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444', margin: '0 0 8px' }}>⚠️ Cons</h4>
                  {selectedProduct.cons.map((c, i) => (
                    <div key={i} style={{ fontSize: '13px', color: '#cbd5e1', padding: '4px 0', display: 'flex', gap: '6px' }}>
                      <AlertTriangle size={14} color="#ef4444" style={{ marginTop: '2px', flexShrink: 0 }} /> {c}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 2 }}>
                  <div><strong style={{ color: '#fff' }}>Best for:</strong> {selectedProduct.bestFor}</div>
                  <div><strong style={{ color: '#fff' }}>Material:</strong> {selectedProduct.material}</div>
                  <div><strong style={{ color: '#fff' }}>Sizes:</strong> {selectedProduct.sizes.join(', ')}</div>
                  <div><strong style={{ color: '#fff' }}>Where to buy:</strong> {selectedProduct.whereToBuy}</div>
                  {selectedProduct.reusable && <div><strong style={{ color: '#10b981' }}>♻️ Reusable</strong> — Lasts {selectedProduct.lifespan}</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Compare Tab ═══ */}
        {activeTab === 'compare' && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>📊 Side-by-Side Comparison</h3>
            {compareList.length < 2 ? (
              <div style={{
                textAlign: 'center', padding: '60px', background: 'rgba(255,255,255,0.03)',
                borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <BarChart3 size={48} color="#64748b" style={{ marginBottom: '16px' }} />
                <div style={{ fontSize: '16px', color: '#94a3b8' }}>Select 2+ products from the Products tab to compare</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>Click the "+ Compare" button on any product card</div>
              </div>
            ) : (
              <>
                <CompareTable products={compareProducts} />
                <div style={{
                  background: 'linear-gradient(135deg, #10b98110, #06b6d410)',
                  borderRadius: '16px', padding: '24px', border: '1px solid #10b98130'
                }}>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#10b981', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={16} /> Quick Comparison Summary
                  </h4>
                  {(() => {
                    const best = (key) => compareProducts.reduce((a, b) => a[key] > b[key] ? a : b)
                    const cheapest = best('valueScore')
                    const mostEco = best('ecoScore')
                    const mostComfort = best('comfortScore')
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '13px' }}>
                        <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                          <div style={{ color: '#94a3b8', marginBottom: '4px' }}>💎 Best Value</div>
                          <div style={{ color: '#fff', fontWeight: 600 }}>{cheapest.name}</div>
                          <div style={{ color: '#10b981', fontSize: '12px' }}>Score: {cheapest.valueScore}/100</div>
                        </div>
                        <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                          <div style={{ color: '#94a3b8', marginBottom: '4px' }}>🌿 Most Eco-Friendly</div>
                          <div style={{ color: '#fff', fontWeight: 600 }}>{mostEco.name}</div>
                          <div style={{ color: '#10b981', fontSize: '12px' }}>Score: {mostEco.ecoScore}/100</div>
                        </div>
                        <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                          <div style={{ color: '#94a3b8', marginBottom: '4px' }}>☁️ Most Comfortable</div>
                          <div style={{ color: '#fff', fontWeight: 600 }}>{mostComfort.name}</div>
                          <div style={{ color: '#ec4899', fontSize: '12px' }}>Score: {mostComfort.comfortScore}/100</div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ Reviews Tab ═══ */}
        {activeTab === 'reviews' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>⭐ Community Reviews</h3>
            {REVIEWS.map((review, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
                padding: '20px', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '20px'
                  }}>{review.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{review.user}</span>
                      {review.verified && (
                        <span style={{ fontSize: '10px', padding: '2px 6px', background: '#10b98120', color: '#10b981', borderRadius: '4px' }}>✓ Verified</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Reviewing: {review.product} · {review.time}</div>
                  </div>
                  <StarRating rating={review.rating} />
                </div>
                <h4 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px' }}>{review.title}</h4>
                <p style={{ fontSize: '14px', color: '#cbd5e1', margin: '0 0 10px', lineHeight: 1.6 }}>{review.text}</p>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <button style={{
                    background: 'none', border: 'none', fontSize: '12px',
                    color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                  }}><ThumbsUp size={14} /> Helpful ({review.helpful})</button>
                  <button style={{
                    background: 'none', border: 'none', fontSize: '12px',
                    color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                  }}><ThumbsDown size={14} /> Not helpful</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Subscriptions Tab ═══ */}
        {activeTab === 'subscriptions' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0' }}>📦 My Subscriptions</h3>
              <button onClick={() => setShowAddSub(!showAddSub)} style={{
                padding: '10px 18px', borderRadius: '10px', background: '#6366f1',
                color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
              }}><Plus size={16} /> Add Subscription</button>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
              padding: '24px', marginBottom: '20px',
              display: 'flex', gap: '32px', border: '1px solid rgba(255,255,255,0.06)'
            }}>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#f59e0b' }}>
                  ${SUBSCRIPTIONS.reduce((s, sub) => {
                    const monthly = sub.frequency === 'Monthly' ? sub.cost : sub.frequency === 'Every 6 months' ? sub.cost / 6 : sub.cost / 12
                    return s + monthly
                  }, 0).toFixed(2)}
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>Monthly Total</div>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#6366f1' }}>
                  ${SUBSCRIPTIONS.reduce((s, sub) => s + sub.cost, 0).toFixed(2)}
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>Yearly Estimate</div>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#10b981' }}>
                  {SUBSCRIPTIONS.filter(s => s.status === 'active').length}
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>Active Subscriptions</div>
              </div>
            </div>
            {SUBSCRIPTIONS.map(sub => (
              <div key={sub.id} style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '14px',
                padding: '20px', marginBottom: '10px',
                border: `1px solid ${sub.status === 'active' ? '#10b98120' : '#f59e0b20'}`,
                display: 'flex', alignItems: 'center', gap: '16px'
              }}>
                <div style={{ fontSize: '32px' }}>{sub.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>{sub.product}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{sub.brand} · {sub.frequency}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#f59e0b' }}>${sub.cost}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Next: {new Date(sub.nextDelivery).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <span style={{
                  fontSize: '11px', padding: '4px 10px', borderRadius: '8px',
                  background: sub.status === 'active' ? '#10b98120' : '#f59e0b20',
                  color: sub.status === 'active' ? '#10b981' : '#f59e0b',
                  fontWeight: 600, textTransform: 'capitalize'
                }}>{sub.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Cost Calculator Tab ═══ */}
        {activeTab === 'cost' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>💰 Lifetime Cost Calculator</h3>
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
              padding: '28px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '20px'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                <div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>Periods per year</div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#6366f1' }}>13 cycles</div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>Average years menstruating</div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#ec4899' }}>38 years</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div style={{
                  background: '#ef444410', borderRadius: '14px', padding: '20px',
                  border: '1px solid #ef444420', textAlign: 'center'
                }}>
                  <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, marginBottom: '4px' }}>Disposable Products</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#ef4444' }}>$894</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>~$7.45/month</div>
                  <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '8px' }}>🗑️ ~10,140 items to landfill</div>
                </div>
                <div style={{
                  background: '#10b98110', borderRadius: '14px', padding: '20px',
                  border: '1px solid #10b98120', textAlign: 'center'
                }}>
                  <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, marginBottom: '4px' }}>Reusable Products</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#10b981' }}>$168</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>~$1.40/month</div>
                  <div style={{ fontSize: '11px', color: '#10b981', marginTop: '8px' }}>♻️ ~10 items total waste</div>
                </div>
                <div style={{
                  background: '#f59e0b10', borderRadius: '14px', padding: '20px',
                  border: '1px solid #f59e0b20', textAlign: 'center'
                }}>
                  <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, marginBottom: '4px' }}>You Save</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#f59e0b' }}>$726</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>over a lifetime</div>
                  <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '8px' }}>🌍 10,130 items saved from landfill</div>
                </div>
              </div>
            </div>
            {/* Product-specific cost comparison */}
            <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px' }}>📊 Product Cost Breakdown (10-Year)</h4>
            {PRODUCTS.sort((a, b) => (a.monthlyCost * 120) - (b.monthlyCost * 120)).map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                background: 'rgba(255,255,255,0.03)', borderRadius: '10px', marginBottom: '6px'
              }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: `${p.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px'
                }}>{PRODUCT_TYPES.find(t => t.id === p.type)?.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{p.brand} · {p.reusable ? '♻️ Reusable' : '🗑️ Disposable'}</div>
                </div>
                <div style={{ width: '200px' }}>
                  <div style={{
                    height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min((p.monthlyCost * 120 / (PRODUCTS[PRODUCTS.length - 1].monthlyCost * 120)) * 100, 100)}%`,
                      background: p.reusable ? '#10b981' : '#ef4444',
                      borderRadius: '4px'
                    }} />
                  </div>
                </div>
                <div style={{
                  fontSize: '14px', fontWeight: 700,
                  color: p.reusable ? '#10b981' : '#ef4444',
                  minWidth: '80px', textAlign: 'right'
                }}>${(p.monthlyCost * 120).toFixed(0)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
