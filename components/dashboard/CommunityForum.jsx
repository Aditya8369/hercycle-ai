'use client'

import { useState, useMemo } from 'react'
import {
  MessageCircle, Users, Heart, ThumbsUp, Reply, Clock, Pin,
  Bookmark, Share2, Search, Filter, Plus, ChevronDown, ChevronUp,
  Star, Shield, Award, TrendingUp, Bell, Eye, Flag, MoreHorizontal,
  Send, Smile, Paperclip, Image, Hash, Flame, Crown, Zap, AlertTriangle
} from 'lucide-react'

// ─── Constants & Mock Data ────────────────────────────────────────

const CATEGORIES = [
  { id: 'general', name: 'General Discussion', icon: '💬', color: '#6366f1', posts: 234, description: 'Open conversations about menstrual health' },
  { id: 'symptoms', name: 'Symptom Sharing', icon: '🩺', color: '#ec4899', posts: 189, description: 'Share and discuss symptoms' },
  { id: 'nutrition', name: 'Nutrition & Diet', icon: '🥗', color: '#10b981', posts: 156, description: 'Diet tips for cycle health' },
  { id: 'fitness', name: 'Fitness & Exercise', icon: '🏋️', color: '#f59e0b', posts: 143, description: 'Exercise recommendations' },
  { id: 'mental-health', name: 'Mental Health', icon: '🧠', color: '#8b5cf6', posts: 178, description: 'Emotional support & mental wellness' },
  { id: 'medical', name: 'Medical Questions', icon: '🏥', color: '#ef4444', posts: 98, description: 'Ask about medical concerns' },
  { id: 'pcos', name: 'PCOS / Endometriosis', icon: '💜', color: '#a855f7', posts: 127, description: 'Support for PCOS and endo' },
  { id: 'trying-to-conceive', name: 'Trying to Conceive', icon: '👶', color: '#06b6d4', posts: 112, description: 'TTC journey discussions' }
]

const FORUM_POSTS = [
  {
    id: 1, author: 'Sarah M.', avatar: '👩‍🦰', role: 'Moderator', badge: '🏆', level: 28,
    category: 'symptoms', title: 'How I finally managed my severe cramps - 3 years of trial & error',
    content: 'After years of debilitating cramps that made me miss work every month, I finally found a combination that works. Sharing my journey in case it helps anyone...',
    likes: 342, replies: 67, views: 2891, pinned: true, featured: true,
    timestamp: '2 hours ago', tags: ['cramps', 'pain-management', 'personal-story'],
    repliesData: [
      { author: 'Priya K.', avatar: '👩', content: 'This is exactly what I needed! The magnesium supplement tip is gold.', likes: 45, time: '1 hour ago' },
      { author: 'Emma L.', avatar: '👩‍🦱', content: 'Have you tried the heating pad method? Game changer for me too.', likes: 23, time: '45 min ago' },
      { author: 'Dr. Maya', avatar: '👩‍⚕️', role: 'Verified Doctor', content: 'Great to hear about the anti-inflammatory diet! I recommend similar approaches to my patients.', likes: 128, time: '30 min ago' }
    ]
  },
  {
    id: 2, author: 'Priya K.', avatar: '👩', role: 'Member', badge: '⭐', level: 15,
    category: 'nutrition', title: 'Best anti-inflammatory foods for period pain - my meal plan',
    content: 'I created a 7-day meal plan focused on reducing inflammation during my cycle. The difference in my cramps has been remarkable!',
    likes: 218, replies: 43, views: 1876, pinned: false, featured: false,
    timestamp: '5 hours ago', tags: ['nutrition', 'anti-inflammatory', 'meal-plan'],
    repliesData: [
      { author: 'Lisa R.', avatar: '👩‍🦳', content: 'Could you share the grocery list? This looks amazing!', likes: 34, time: '4 hours ago' },
      { author: 'Anna W.', avatar: '👱‍♀️', content: 'Turmeric milk before bed has helped me so much too!', likes: 28, time: '3 hours ago' }
    ]
  },
  {
    id: 3, author: 'Dr. Maya', avatar: '👩‍⚕️', role: 'Verified Doctor', badge: '🛡️', level: 45,
    category: 'medical', title: 'AMA: Ask me anything about endometriosis - 10 years experience',
    content: 'I am a gynecologist specializing in endometriosis. Happy to answer your questions about diagnosis, treatment options, and living with endo.',
    likes: 567, replies: 124, views: 8934, pinned: true, featured: true,
    timestamp: '1 day ago', tags: ['AMA', 'endometriosis', 'medical-expert'],
    repliesData: [
      { author: 'Kelly B.', avatar: '👩‍🦲', content: 'What are the early signs that doctors often miss?', likes: 89, time: '23 hours ago' },
      { author: 'Dr. Maya', avatar: '👩‍⚕️', content: 'Painful periods alone shouldn\'t be dismissed. Pain that disrupts daily life is always worth investigating.', likes: 234, time: '22 hours ago' }
    ]
  },
  {
    id: 4, author: 'Lisa R.', avatar: '👩‍🦳', role: 'Member', badge: '⭐', level: 22,
    category: 'pcos', title: 'PCOS diagnosis at 30 - my lifestyle changes that actually worked',
    content: 'When I was diagnosed with PCOS at 30, I felt lost. But after 18 months of consistent changes, my cycles are now regular and my symptoms are manageable.',
    likes: 456, replies: 89, views: 5678, pinned: false, featured: true,
    timestamp: '2 days ago', tags: ['PCOS', 'lifestyle', 'personal-story', 'success'],
    repliesData: [
      { author: 'Mia T.', avatar: '👧', content: 'This gives me so much hope! I was just diagnosed last week.', likes: 56, time: '1 day ago' },
      { author: 'Sarah M.', avatar: '👩‍🦰', content: 'The metformin + inositol combo worked for me too!', likes: 41, time: '1 day ago' }
    ]
  },
  {
    id: 5, author: 'Anna W.', avatar: '👱‍♀️', role: 'Member', badge: '🔥', level: 19,
    category: 'fitness', title: 'Cycle-syncing my workout routine - complete guide',
    content: 'I designed a 4-week workout plan that syncs with each phase of my menstrual cycle. Energy levels finally feel matched to my training!',
    likes: 312, replies: 56, views: 3456, pinned: false, featured: false,
    timestamp: '3 days ago', tags: ['fitness', 'cycle-sync', 'workout'],
    repliesData: [
      { author: 'Jade P.', avatar: '👩‍🎤', content: 'The follicular phase HIIT tip is brilliant!', likes: 32, time: '2 days ago' },
      { author: 'Kelly B.', avatar: '👩‍🦲', content: 'Yoga during luteal phase changed everything for me.', likes: 27, time: '2 days ago' }
    ]
  },
  {
    id: 6, author: 'Kelly B.', avatar: '👩‍🦲', role: 'Member', badge: '⭐', level: 12,
    category: 'mental-health', title: 'Dealing with PMDD - finding light in the dark days',
    content: 'PMDD has affected every aspect of my life. I want to share the coping strategies, therapy approaches, and support systems that helped me through.',
    likes: 389, replies: 78, views: 4567, pinned: false, featured: false,
    timestamp: '4 days ago', tags: ['PMDD', 'mental-health', 'coping', 'support'],
    repliesData: [
      { author: 'Sarah M.', avatar: '👩‍🦰', content: 'Thank you for being so open about this. You are not alone. 💜', likes: 89, time: '3 days ago' },
      { author: 'Dr. Maya', avatar: '👩‍⚕️', content: 'For anyone reading: SSRIs taken only during the luteal phase can be very effective for PMDD.', likes: 156, time: '3 days ago' }
    ]
  },
  {
    id: 7, author: 'Mia T.', avatar: '👧', role: 'New Member', badge: '🌱', level: 3,
    category: 'trying-to-conceive', title: 'First cycle trying - overwhelmed with information!',
    content: 'My partner and I just started trying. There is SO much conflicting advice online. Where do I even start? Looking for practical, evidence-based guidance.',
    likes: 156, replies: 92, views: 2345, pinned: false, featured: false,
    timestamp: '5 days ago', tags: ['TTC', 'beginner', 'advice'],
    repliesData: [
      { author: 'Priya K.', avatar: '👩', content: 'Start with prenatals NOW and track your cycle with the app!', likes: 43, time: '4 days ago' },
      { author: 'Lisa R.', avatar: '👩‍🦳', content: 'Join the TTC group in the Support Circles section!', likes: 28, time: '4 days ago' }
    ]
  }
]

const SUPPORT_CIRCLES = [
  { id: 1, name: 'PCOS Warriors', icon: '💜', members: 234, active: 18, color: '#a855f7', description: 'Support group for women with PCOS', joined: true, posts: 1234 },
  { id: 2, name: 'Endo Sisters', icon: '🩷', members: 189, active: 12, color: '#ec4899', description: 'Endometriosis support and resources', joined: false, posts: 987 },
  { id: 3, name: 'TTC Journey', icon: '👶', members: 312, active: 24, color: '#06b6d4', description: 'Trying to conceive support circle', joined: true, posts: 1567 },
  { id: 4, name: 'PMDD Support', icon: '🌙', members: 156, active: 9, color: '#8b5cf6', description: 'Premenstrual dysphoric disorder support', joined: false, posts: 678 },
  { id: 5, name: 'Period Positive', icon: '🩸', members: 456, active: 31, color: '#ef4444', description: 'Normalizing period conversations', joined: true, posts: 2345 },
  { id: 6, name: 'Menopause Talk', icon: '🌅', members: 278, active: 15, color: '#f59e0b', description: 'Navigating perimenopause and menopause', joined: false, posts: 890 },
  { id: 7, name: 'Teen Health', icon: '🌸', members: 345, active: 22, color: '#10b981', description: 'Safe space for teens to ask questions', joined: false, posts: 1123 },
  { id: 8, name: 'New Moms', icon: '🤱', members: 267, active: 19, color: '#0ea5e9', description: 'Postpartum cycle and health support', joined: false, posts: 756 }
]

const TOP_CONTRIBUTORS = [
  { name: 'Dr. Maya', avatar: '👩‍⚕️', badge: '🛡️', points: 4567, posts: 234, helpful: 892, role: 'Expert', level: 45 },
  { name: 'Sarah M.', avatar: '👩‍🦰', badge: '🏆', points: 3890, posts: 198, helpful: 756, role: 'Moderator', level: 28 },
  { name: 'Priya K.', avatar: '👩', badge: '⭐', points: 2345, posts: 156, helpful: 534, role: 'Member', level: 15 },
  { name: 'Lisa R.', avatar: '👩‍🦳', badge: '⭐', points: 1987, posts: 134, helpful: 467, role: 'Member', level: 22 },
  { name: 'Kelly B.', avatar: '👩‍🦲', badge: '🔥', points: 1567, posts: 112, helpful: 389, role: 'Member', level: 12 }
]

const TRENDING_TOPICS = [
  { tag: '#CycleSyncing', posts: 456, trend: 'up' },
  { tag: '#PCOSWarriors', posts: 389, trend: 'up' },
  { tag: '#PeriodPositivity', posts: 312, trend: 'stable' },
  { tag: '#EndoAwareness', posts: 278, trend: 'up' },
  { tag: '#HealthyPeriods', posts: 234, trend: 'up' }
]

const ANNOUNCEMENTS = [
  { title: 'Live Q&A with Dr. Maya', date: 'Tomorrow, 7 PM IST', type: 'event', icon: '🎙️' },
  { title: 'New: Cycle Syncing Challenge starts Monday!', date: 'In 3 days', type: 'challenge', icon: '🏆' },
  { title: 'Community Guidelines Updated', date: '2 days ago', type: 'update', icon: '📋' }
]

// ─── Helper Functions ─────────────────────────────────────────────

function formatNumber(num) {
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return num.toString()
}

// ─── Sub-Components ───────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, color, trend }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '16px',
      padding: '20px',
      border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      alignItems: 'center',
      gap: '14px'
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px',
        background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <Icon size={24} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: '#fff' }}>{value}</div>
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>{label}</div>
        {trend && <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>↑ {trend}</div>}
      </div>
    </div>
  )
}

function CategoryCard({ category, isSelected, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: isSelected ? `${category.color}20` : 'rgba(255,255,255,0.03)',
      borderRadius: '14px',
      padding: '16px',
      border: `1px solid ${isSelected ? category.color + '60' : 'rgba(255,255,255,0.06)'}`,
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '12px',
        background: `${category.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '22px'
      }}>{category.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{category.name}</div>
        <div style={{ fontSize: '12px', color: '#94a3b8' }}>{category.posts} posts</div>
      </div>
      <div style={{
        fontSize: '11px', color: category.color,
        background: `${category.color}15`, padding: '4px 8px',
        borderRadius: '8px', fontWeight: 600
      }}>→</div>
    </div>
  )
}

function PostCard({ post, onExpand, isExpanded }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '16px',
      border: `1px solid ${post.featured ? '#ec489930' : 'rgba(255,255,255,0.06)'}`,
      overflow: 'hidden'
    }}>
      {post.pinned && (
        <div style={{
          background: 'linear-gradient(135deg, #f59e0b20, #ef444420)',
          padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: '12px', color: '#f59e0b', fontWeight: 600
        }}>
          <Pin size={14} /> Pinned Post
        </div>
      )}
      <div style={{ padding: '20px' }}>
        {/* Author row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px'
          }}>{post.avatar}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{post.author}</span>
              <span style={{ fontSize: '14px' }}>{post.badge}</span>
              {post.role !== 'Member' && post.role !== 'New Member' && (
                <span style={{
                  fontSize: '10px', padding: '2px 6px',
                  background: post.role === 'Moderator' ? '#f59e0b20' : '#ec489920',
                  color: post.role === 'Moderator' ? '#f59e0b' : '#ec4899',
                  borderRadius: '6px', fontWeight: 600
                }}>{post.role}</span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Level {post.level} · {post.timestamp}
            </div>
          </div>
          <button style={{
            background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '8px',
            padding: '8px', cursor: 'pointer', color: '#94a3b8'
          }}><MoreHorizontal size={16} /></button>
        </div>

        {/* Title & content */}
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: '0 0 8px', lineHeight: 1.4 }}>
          {post.title}
        </h3>
        <p style={{ fontSize: '14px', color: '#cbd5e1', margin: '0 0 12px', lineHeight: 1.6 }}>
          {post.content}
        </p>

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
          {post.tags.map(tag => (
            <span key={tag} style={{
              fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
              background: '#6366f120', color: '#818cf8', fontWeight: 500
            }}>#{tag}</span>
          ))}
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', color: '#ec4899',
            fontSize: '13px', cursor: 'pointer', fontWeight: 500
          }}>
            <Heart size={16} /> {post.likes}
          </button>
          <button onClick={onExpand} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', color: '#94a3b8',
            fontSize: '13px', cursor: 'pointer', fontWeight: 500
          }}>
            <MessageCircle size={16} /> {post.replies} replies
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontSize: '13px' }}>
            <Eye size={14} /> {formatNumber(post.views)}
          </div>
          <div style={{ flex: 1 }} />
          <button style={{
            background: 'none', border: 'none', color: '#64748b', cursor: 'pointer'
          }}><Bookmark size={16} /></button>
          <button style={{
            background: 'none', border: 'none', color: '#64748b', cursor: 'pointer'
          }}><Share2 size={16} /></button>
        </div>

        {/* Expanded replies */}
        {isExpanded && post.repliesData && (
          <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
            {post.repliesData.map((reply, i) => (
              <div key={i} style={{
                display: 'flex', gap: '10px', padding: '12px',
                background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
                marginBottom: '8px'
              }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px', flexShrink: 0
                }}>{reply.avatar}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{reply.author}</span>
                    {reply.role && (
                      <span style={{
                        fontSize: '9px', padding: '1px 5px',
                        background: '#ec489920', color: '#ec4899', borderRadius: '4px'
                      }}>{reply.role}</span>
                    )}
                    <span style={{ fontSize: '11px', color: '#64748b' }}>· {reply.time}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>{reply.content}</div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                    <button style={{
                      background: 'none', border: 'none', fontSize: '11px',
                      color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                    }}>
                      <ThumbsUp size={12} /> {reply.likes}
                    </button>
                    <button style={{
                      background: 'none', border: 'none', fontSize: '11px',
                      color: '#94a3b8', cursor: 'pointer'
                    }}>Reply</button>
                  </div>
                </div>
              </div>
            ))}
            {/* Reply input */}
            <div style={{
              display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px'
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: '#6366f130', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', flexShrink: 0
              }}>😊</div>
              <div style={{
                flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '12px',
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px',
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                <input placeholder="Write a reply..." style={{
                  flex: 1, background: 'none', border: 'none', color: '#fff',
                  fontSize: '13px', outline: 'none'
                }} />
                <button style={{
                  background: 'none', border: 'none', color: '#64748b', cursor: 'pointer'
                }}><Smile size={16} /></button>
                <button style={{
                  background: '#6366f1', border: 'none', borderRadius: '8px',
                  padding: '6px 12px', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600
                }}><Send size={14} /> Send</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SupportCircleCard({ circle }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '14px',
      padding: '18px',
      border: `1px solid ${circle.color}30`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '12px',
          background: `${circle.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '24px'
        }}>{circle.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{circle.name}</div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>{circle.description}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '12px', color: '#94a3b8' }}>
        <span>👥 {circle.members}</span>
        <span>🟢 {circle.active} active</span>
        <span>💬 {formatNumber(circle.posts)} posts</span>
      </div>
      <button style={{
        width: '100%', padding: '10px',
        background: circle.joined ? `${circle.color}20` : circle.color,
        color: circle.joined ? circle.color : '#fff',
        border: circle.joined ? `1px solid ${circle.color}40` : 'none',
        borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
      }}>
        {circle.joined ? '✓ Joined' : 'Join Circle'}
      </button>
    </div>
  )
}

function ContributorCard({ contributor, rank }) {
  const rankColors = ['#f59e0b', '#94a3b8', '#cd7f32']
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
      background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
      border: rank < 3 ? '1px solid rgba(255,255,255,0.08)' : 'none'
    }}>
      <div style={{
        width: '28px', height: '28px', borderRadius: '50%',
        background: rank < 3 ? `${rankColors[rank]}20` : 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '12px', fontWeight: 700, color: rankColors[rank] || '#64748b'
      }}>{rank + 1}</div>
      <div style={{ fontSize: '20px' }}>{contributor.avatar}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{contributor.name}</span>
          <span>{contributor.badge}</span>
        </div>
        <div style={{ fontSize: '11px', color: '#64748b' }}>Level {contributor.level} · {contributor.role}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b' }}>{formatNumber(contributor.points)}</div>
        <div style={{ fontSize: '11px', color: '#64748b' }}>pts</div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────

export default function CommunityForum() {
  const [activeTab, setActiveTab] = useState('forum')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedPost, setExpandedPost] = useState(null)
  const [sortBy, setSortBy] = useState('trending')

  const tabs = [
    { id: 'forum', label: 'Discussion Forum', icon: MessageCircle },
    { id: 'circles', label: 'Support Circles', icon: Users },
    { id: 'trending', label: 'Trending', icon: Flame },
    { id: 'leaders', label: 'Top Contributors', icon: Crown },
    { id: 'announcements', label: 'Announcements', icon: Bell }
  ]

  const filteredPosts = useMemo(() => {
    let posts = [...FORUM_POSTS]
    if (selectedCategory !== 'all') {
      posts = posts.filter(p => p.category === selectedCategory)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      posts = posts.filter(p => p.title.toLowerCase().includes(q) || p.tags.some(t => t.includes(q)))
    }
    if (sortBy === 'trending') posts.sort((a, b) => (b.likes + b.replies * 3) - (a.likes + a.replies * 3))
    if (sortBy === 'newest') posts.sort((a, b) => a.id - b.id)
    if (sortBy === 'most-replies') posts.sort((a, b) => b.replies - a.replies)
    if (sortBy === 'most-liked') posts.sort((a, b) => b.likes - a.likes)
    return posts
  }, [selectedCategory, searchQuery, sortBy])

  const totalStats = {
    members: '12.4k', posts: '8,934', replies: '45.2k', online: '342'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#fff', padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 8px' }}>
            💬 Community Forum
          </h1>
          <p style={{ fontSize: '16px', color: '#94a3b8', margin: '0' }}>
            A safe space for menstrual health discussions, support, and shared experiences
          </p>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
          <KPICard icon={Users} label="Community Members" value={totalStats.members} color="#6366f1" trend="12% this month" />
          <KPICard icon={MessageCircle} label="Total Posts" value={totalStats.posts} color="#ec4899" trend="23% this week" />
          <KPICard icon={Reply} label="Total Replies" value={totalStats.replies} color="#10b981" trend="18% this week" />
          <KPICard icon={Zap} label="Online Now" value={totalStats.online} color="#f59e0b" trend="Peak hours" />
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)',
          borderRadius: '14px', padding: '4px', marginBottom: '24px',
          border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto'
        }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
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

        {/* ═══ Forum Tab ═══ */}
        {activeTab === 'forum' && (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px' }}>
            {/* Sidebar - Categories */}
            <div>
              <div style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
                padding: '18px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '16px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px', color: '#fff' }}>Categories</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button onClick={() => setSelectedCategory('all')} style={{
                    padding: '10px 12px', borderRadius: '10px',
                    background: selectedCategory === 'all' ? '#6366f120' : 'transparent',
                    border: selectedCategory === 'all' ? '1px solid #6366f140' : '1px solid transparent',
                    color: selectedCategory === 'all' ? '#818cf8' : '#94a3b8',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer', textAlign: 'left'
                  }}>📋 All Topics</button>
                  {CATEGORIES.map(cat => (
                    <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{
                      padding: '8px 10px', borderRadius: '10px',
                      background: selectedCategory === cat.id ? `${cat.color}15` : 'transparent',
                      border: selectedCategory === cat.id ? `1px solid ${cat.color}30` : '1px solid transparent',
                      color: selectedCategory === cat.id ? cat.color : '#94a3b8',
                      fontSize: '12px', fontWeight: 500, cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                      <span>{cat.icon}</span>
                      <span style={{ flex: 1 }}>{cat.name}</span>
                      <span style={{ fontSize: '11px', opacity: 0.7 }}>{cat.posts}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* New Post Button */}
              <button style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', border: 'none', fontSize: '14px', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '8px'
              }}>
                <Plus size={18} /> New Discussion
              </button>
            </div>

            {/* Posts list */}
            <div>
              {/* Search & Sort */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div style={{
                  flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '12px',
                  padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <Search size={16} color="#64748b" />
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search discussions..."
                    style={{
                      flex: 1, background: 'none', border: 'none', color: '#fff',
                      fontSize: '13px', outline: 'none'
                    }} />
                </div>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
                  background: 'rgba(255,255,255,0.05)', borderRadius: '12px',
                  padding: '10px 14px', color: '#fff', border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: '13px', outline: 'none', cursor: 'pointer'
                }}>
                  <option value="trending">🔥 Trending</option>
                  <option value="newest">🕐 Newest</option>
                  <option value="most-replies">💬 Most Replied</option>
                  <option value="most-liked">❤️ Most Liked</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredPosts.map(post => (
                  <PostCard key={post.id} post={post}
                    isExpanded={expandedPost === post.id}
                    onExpand={() => setExpandedPost(expandedPost === post.id ? null : post.id)} />
                ))}
                {filteredPosts.length === 0 && (
                  <div style={{
                    textAlign: 'center', padding: '48px', color: '#64748b', fontSize: '14px'
                  }}>
                    No posts found matching your search.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Support Circles Tab ═══ */}
        {activeTab === 'circles' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {SUPPORT_CIRCLES.map(circle => (
              <SupportCircleCard key={circle.id} circle={circle} />
            ))}
          </div>
        )}

        {/* ═══ Trending Tab ═══ */}
        {activeTab === 'trending' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>🔥 Trending Topics</h3>
              {TRENDING_TOPICS.map((topic, i) => (
                <div key={topic.tag} style={{
                  display: 'flex', alignItems: 'center', gap: '14px', padding: '16px',
                  background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
                  marginBottom: '8px', border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: i === 0 ? '#ef444420' : i === 1 ? '#f59e0b20' : 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 700, color: i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#64748b'
                  }}>#{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#6366f1' }}>{topic.tag}</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>{topic.posts} posts</div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    color: topic.trend === 'up' ? '#10b981' : '#f59e0b', fontSize: '13px', fontWeight: 600
                  }}>
                    <TrendingUp size={16} />
                    {topic.trend === 'up' ? '↑' : '→'}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>🌟 Featured Posts</h3>
              {FORUM_POSTS.filter(p => p.featured).map(post => (
                <div key={post.id} style={{
                  padding: '18px', background: 'rgba(255,255,255,0.03)',
                  borderRadius: '14px', marginBottom: '10px',
                  border: '1px solid #ec489920'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px' }}>{post.avatar}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{post.author}</span>
                    <span>{post.badge}</span>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>{post.title}</div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#94a3b8' }}>
                    <span>❤️ {post.likes}</span>
                    <span>💬 {post.replies}</span>
                    <span>👁️ {formatNumber(post.views)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Top Contributors Tab ═══ */}
        {activeTab === 'leaders' && (
          <div style={{ maxWidth: '700px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>👑 Community Champions</h3>
            {TOP_CONTRIBUTORS.map((c, i) => (
              <div key={c.name} style={{ marginBottom: '8px' }}>
                <ContributorCard contributor={c} rank={i} />
              </div>
            ))}
            <div style={{
              marginTop: '24px', padding: '24px', background: 'rgba(255,255,255,0.03)',
              borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center'
            }}>
              <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px' }}>
                Earn points by posting, replying, and getting upvotes!
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', fontSize: '13px' }}>
                <span>💬 5 pts / post</span>
                <span>↩️ 3 pts / reply</span>
                <span>❤️ 1 pt / upvote received</span>
                <span>🏆 +50 bonus / featured</span>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Announcements Tab ═══ */}
        {activeTab === 'announcements' && (
          <div style={{ maxWidth: '700px', margin: '0 auto' }}>
            {ANNOUNCEMENTS.map((ann, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '16px', padding: '20px',
                background: 'rgba(255,255,255,0.03)', borderRadius: '14px',
                marginBottom: '12px', border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <div style={{ fontSize: '28px' }}>{ann.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>{ann.title}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{ann.date}</div>
                </div>
                <span style={{
                  fontSize: '11px', padding: '4px 10px', borderRadius: '8px',
                  background: ann.type === 'event' ? '#6366f120' : ann.type === 'challenge' ? '#f59e0b20' : '#10b98120',
                  color: ann.type === 'event' ? '#818cf8' : ann.type === 'challenge' ? '#f59e0b' : '#10b981',
                  fontWeight: 600, textTransform: 'capitalize'
                }}>{ann.type}</span>
              </div>
            ))}

            {/* Community Guidelines */}
            <div style={{
              marginTop: '32px', padding: '24px',
              background: 'linear-gradient(135deg, #6366f110, #8b5cf610)',
              borderRadius: '16px', border: '1px solid #6366f130'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={18} color="#6366f1" /> Community Guidelines
              </h3>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#cbd5e1', lineHeight: 2 }}>
                <li>Be respectful and supportive — everyone&apos;s journey is different</li>
                <li>No medical advice from non-professionals — always consult a doctor</li>
                <li>Protect privacy — don&apos;t share personal health information of others</li>
                <li>Report harmful content — keep our community safe</li>
                <li>Evidence-based information preferred over anecdotes</li>
                <li>No spam, promotions, or unsolicited product recommendations</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
