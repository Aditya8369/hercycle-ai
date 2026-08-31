'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  BookOpen, GraduationCap, Brain, Award, Search, Filter, ChevronRight,
  ChevronDown, ChevronUp, CheckCircle, XCircle, AlertTriangle, Lightbulb,
  Clock, Eye, Star, Bookmark, Share2, ArrowRight, Zap, Heart, Shield,
  Target, Info, ThumbsUp, Play, BarChart3, Trophy, Sparkles, Users
} from 'lucide-react'

// ─── Constants & Data ─────────────────────────────────────────────

const CATEGORIES = [
  { id: 'anatomy', name: 'Anatomy & Physiology', icon: '🫀', color: '#ef4444', articles: 24, description: 'Understanding the reproductive system' },
  { id: 'menstrual-cycle', name: 'Menstrual Cycle', icon: '🔄', color: '#ec4899', articles: 31, description: 'Phases, hormones, and what happens each day' },
  { id: 'symptoms', name: 'Symptoms & Conditions', icon: '🩺', color: '#f59e0b', articles: 28, description: 'Common symptoms and medical conditions' },
  { id: 'nutrition', name: 'Nutrition & Diet', icon: '🥗', color: '#10b981', articles: 19, description: 'Food, supplements, and dietary advice' },
  { id: 'mental-health', name: 'Mental Health', icon: '🧠', color: '#8b5cf6', articles: 16, description: 'Emotional wellbeing and mental health' },
  { id: 'exercise', name: 'Exercise & Fitness', icon: '🏋️', color: '#06b6d4', articles: 14, description: 'Physical activity and cycle fitness' },
  { id: 'hygiene', name: 'Hygiene & Products', icon: '🧼', color: '#14b8a6', articles: 12, description: 'Period products and hygiene tips' },
  { id: 'fertility', name: 'Fertility & Contraception', icon: '👶', color: '#f97316', articles: 22, description: 'Reproductive health and family planning' }
]

const ARTICLES = [
  {
    id: 1, category: 'anatomy', title: 'The Menstrual Cycle: A Complete Guide',
    summary: 'Understand every phase of the menstrual cycle, from menstruation to ovulation and beyond.',
    readTime: '8 min', difficulty: 'Beginner', views: 12456, likes: 892,
    content: [
      { heading: 'What is the Menstrual Cycle?', text: 'The menstrual cycle is a complex series of hormonal changes that prepare the body for potential pregnancy. It typically lasts 21-35 days and involves the ovaries, uterus, and a cascade of hormones including estrogen, progesterone, FSH, and LH.' },
      { heading: 'The Four Phases', text: 'Phase 1: Menstruation (Days 1-5) — The uterine lining sheds, resulting in menstrual bleeding. Hormone levels are at their lowest. Phase 2: Follicular Phase (Days 1-13) — Overlapping with menstruation, FSH stimulates follicle growth in the ovaries. Estrogen rises, thickening the uterine lining. Phase 3: Ovulation (Day 14) — A surge in LH triggers the release of a mature egg from the ovary. This is the most fertile window. Phase 4: Luteal Phase (Days 15-28) — The empty follicle becomes the corpus luteum, producing progesterone to maintain the uterine lining. If no fertilization occurs, hormone levels drop and menstruation begins.' },
      { heading: 'Hormones Explained', text: 'FSH (Follicle Stimulating Hormone): Stimulates ovarian follicle growth. LH (Luteinizing Hormone): Triggers ovulation. Estrogen: Thickens uterine lining, regulates cycle. Progesterone: Maintains lining, prepares for implantation.' },
      { heading: 'When to See a Doctor', text: 'Consult a healthcare provider if you experience: cycles shorter than 21 days or longer than 35 days, extremely heavy bleeding, severe pain that disrupts daily life, absence of periods for 3+ months (if not pregnant), or unusual discharge.' }
    ],
    quiz: [
      { q: 'What is the average length of a menstrual cycle?', options: ['14-21 days', '21-35 days', '35-45 days', '7-14 days'], answer: 1, explanation: 'A normal menstrual cycle ranges from 21 to 35 days, with 28 days being the average.' },
      { q: 'Which hormone triggers ovulation?', options: ['Estrogen', 'Progesterone', 'FSH', 'LH (Luteinizing Hormone)'], answer: 3, explanation: 'A surge in LH (Luteinizing Hormone) triggers the release of the egg from the ovary.' },
      { q: 'During which phase does the uterine lining shed?', options: ['Follicular phase', 'Ovulation', 'Luteal phase', 'Menstruation'], answer: 3, explanation: 'During menstruation, the uterine lining sheds when pregnancy has not occurred.' }
    ],
    keyTakeaways: ['The cycle has 4 main phases', 'Hormones orchestrate the entire process', '21-35 day cycles are normal', 'Tracking helps identify irregularities']
  },
  {
    id: 2, category: 'symptoms', title: 'Understanding Period Cramps (Dysmenorrhea)',
    summary: 'Why cramps happen, when they\'re normal, and evidence-based ways to find relief.',
    readTime: '6 min', difficulty: 'Beginner', views: 9876, likes: 734,
    content: [
      { heading: 'What Causes Cramps?', text: 'Period cramps occur when the uterus contracts to shed its lining. Prostaglandins — hormone-like substances — trigger these contractions. Higher prostaglandin levels mean more intense cramps. The pain typically starts 1-3 days before menstruation and peaks within 24-48 hours.' },
      { heading: 'Normal vs. Concerning Cramps', text: 'Normal cramps: Mild to moderate discomfort manageable with OTC pain relief. Concerning signs: Pain that doesn\'t improve with medication, progressively worsening pain over months, pain that prevents daily activities, or cramps accompanied by fever, heavy bleeding, or unusual discharge.' },
      { heading: 'Evidence-Based Relief Methods', text: '1. NSAIDs (ibuprofen, naproxen) — Block prostaglandin production. Take at first sign of pain. 2. Heat therapy — Heating pads relax uterine muscles. 3. Exercise — Gentle movement increases blood flow and releases endorphins. 4. Ginger tea — Studies show it reduces prostaglandin levels. 5. Magnesium — Relaxes smooth muscles. 6. TENS machine — Electrical stimulation reduces pain signals.' },
      { heading: 'When to Seek Help', text: 'See a doctor if cramps interfere with work/school, OTC medications don\'t help, pain is getting worse over time, or you have additional symptoms like heavy bleeding or pain during intercourse — these could indicate endometriosis or fibroids.' }
    ],
    quiz: [
      { q: 'What substance primarily causes period cramps?', options: ['Estrogen', 'Prostaglandins', 'Insulin', 'Cortisol'], answer: 1, explanation: 'Prostaglandins trigger uterine contractions and are the primary cause of period cramps.' },
      { q: 'Which OTC medication class is most effective for cramps?', options: ['Acetaminophen', 'Antihistamines', 'NSAIDs (like ibuprofen)', 'Antacids'], answer: 2, explanation: 'NSAIDs block prostaglandin production and are the most effective OTC treatment for menstrual cramps.' }
    ],
    keyTakeaways: ['Prostaglandins cause uterine contractions', 'NSAIDs are the most effective OTC relief', 'Heat therapy relaxes muscles', 'Severe cramps may indicate underlying conditions']
  },
  {
    id: 3, category: 'nutrition', title: 'Cycle-Syncing Your Diet',
    summary: 'How to adjust your nutrition for each menstrual phase to optimize energy and reduce symptoms.',
    readTime: '7 min', difficulty: 'Intermediate', views: 8234, likes: 645,
    content: [
      { heading: 'Why Cycle-Sync Your Diet?', text: 'Your nutritional needs change throughout your cycle as hormones fluctuate. Eating in harmony with your cycle can help reduce PMS symptoms, boost energy levels, and support hormonal balance.' },
      { heading: 'Menstrual Phase Nutrition', text: 'Focus on iron-rich foods to replenish blood loss: red meat, spinach, lentils, dark chocolate. Increase vitamin C to aid iron absorption. Anti-inflammatory foods like fatty fish and turmeric reduce cramps. Stay well-hydrated.' },
      { heading: 'Follicular Phase Nutrition', text: 'Estrogen rises — your body is building up. Focus on fermented foods (yogurt, kimchi) for gut health. Lean proteins support growing follicles. Fresh, light foods and sprouted grains provide sustained energy. This is a great time for new dietary experiments.' },
      { heading: 'Ovulation Phase Nutrition', text: 'Peak energy and metabolism. Raw vegetables and high-fiber foods support estrogen detoxification. Antioxidant-rich berries and colorful vegetables. Fiber helps eliminate excess hormones.' },
      { heading: 'Luteal Phase Nutrition', text: 'Progesterone rises — cravings increase. Complex carbs (sweet potato, quinoa) stabilize blood sugar. Calcium-rich foods reduce PMS. Magnesium from dark chocolate and nuts helps with mood. Vitamin B6 from chickpeas and salmon supports serotonin production.' }
    ],
    quiz: [
      { q: 'Which nutrient is most important during menstruation?', options: ['Vitamin C', 'Iron', 'Calcium', 'Protein'], answer: 1, explanation: 'Iron is crucial during menstruation to replenish blood loss from bleeding.' },
      { q: 'What helps reduce cravings during the luteal phase?', options: ['High-sugar foods', 'Complex carbohydrates', 'Caffeine', 'Skipping meals'], answer: 1, explanation: 'Complex carbohydrates stabilize blood sugar and reduce cravings during the luteal phase.' }
    ],
    keyTakeaways: ['Nutritional needs change with each phase', 'Iron replenishment is key during menstruation', 'Complex carbs help during the luteal phase', 'Anti-inflammatory foods reduce cramps']
  },
  {
    id: 4, category: 'mental-health', title: 'Managing PMDD: Beyond PMS',
    summary: 'Understanding Premenstrual Dysphoric Disorder and evidence-based treatment options.',
    readTime: '9 min', difficulty: 'Advanced', views: 6789, likes: 523,
    content: [
      { heading: 'What is PMDD?', text: 'PMDD (Premenstrual Dysphoric Disorder) is a severe form of PMS affecting 3-8% of menstruating women. Unlike typical PMS, PMDD causes debilitating emotional and physical symptoms that significantly impact daily functioning, relationships, and quality of life.' },
      { heading: 'Symptoms vs. PMS', text: 'PMDD symptoms include: severe depression, anxiety, mood swings, irritability, hopelessness, difficulty concentrating, food cravings, insomnia, physical symptoms. Key difference: PMDD symptoms are severe enough to interfere with work, relationships, and daily activities.' },
      { heading: 'Treatment Options', text: '1. SSRIs (first-line) — Can be taken only during the luteal phase. 2. Hormonal birth control — Suppresses ovulation. 3. Cognitive Behavioral Therapy (CBT) — Helps manage emotional symptoms. 4. Calcium & Vitamin B6 — Show moderate evidence. 5. Lifestyle changes — Regular exercise, stress management, sleep hygiene. 6. Severe cases: Surgical options like oophorectomy.' },
      { heading: 'Self-Care Strategies', text: 'Track your cycle meticulously to predict episodes. Build a support network who understands PMDD. Create a "PMDD toolkit" — comfort items, gentle activities, easy meals. Reduce commitments during the luteal phase. Practice self-compassion — it\'s a medical condition, not a character flaw.' }
    ],
    quiz: [
      { q: 'What percentage of menstruating women have PMDD?', options: ['10-15%', '3-8%', '20-25%', '1-2%'], answer: 1, explanation: 'PMDD affects approximately 3-8% of menstruating women, making it more common than often recognized.' },
      { q: 'What is the first-line treatment for PMDD?', options: ['Surgery', 'Antibiotics', 'SSRIs', 'Herbal supplements'], answer: 2, explanation: 'SSRIs (Selective Serotonin Reuptake Inhibitors) are the first-line treatment for PMDD and can even be taken only during the luteal phase.' }
    ],
    keyTakeaways: ['PMDD affects 3-8% of menstruating women', 'It\'s more severe than typical PMS', 'SSRIs are the first-line treatment', 'Cycle tracking helps predict and manage episodes']
  },
  {
    id: 5, category: 'exercise', title: 'Cycle-Syncing Your Workout',
    summary: 'Optimize your exercise routine based on your menstrual cycle phase for better results.',
    readTime: '6 min', difficulty: 'Beginner', views: 7654, likes: 598,
    content: [
      { heading: 'Why Exercise Changes Matter', text: 'Your body\'s energy, recovery ability, and injury risk change throughout your cycle. Matching your workout intensity to your hormonal state can improve performance, reduce injury risk, and make exercise feel more enjoyable.' },
      { heading: 'Menstruation (Days 1-5)', text: 'Energy is low but steady. Great for: Gentle yoga, walking, light swimming, stretching. Avoid: High-intensity training. Listen to your body — rest if needed. Light movement can actually help reduce cramps.' },
      { heading: 'Follicular Phase (Days 6-13)', text: 'Estrogen rises — energy increases! Great for: HIIT, strength training, running, dance classes, trying new activities. Your body recovers faster during this phase. This is your power phase — push yourself!' },
      { heading: 'Ovulation (Days 14-16)', text: 'Peak performance potential. Great for: Maximal lifts, competition, personal records. Be cautious: joints may be more lax due to relaxin, increasing injury risk. Warm up thoroughly.' },
      { heading: 'Luteal Phase (Days 17-28)', text: 'Progesterone rises, body temperature increases. Great for: Moderate cardio, pilates, swimming, cycling. Reduce intensity in the late luteal phase. Your body burns more calories but has less energy — adjust accordingly.' }
    ],
    quiz: [
      { q: 'When is the best time for high-intensity training?', options: ['Menstruation', 'Follicular phase', 'Luteal phase', 'Any time'], answer: 1, explanation: 'The follicular phase (days 6-13) is when rising estrogen provides the most energy and fastest recovery, making it ideal for intense workouts.' },
      { q: 'What hormone increases joint laxity during ovulation?', options: ['Estrogen', 'Progesterone', 'Relaxin', 'Testosterone'], answer: 2, explanation: 'Relaxin, which peaks around ovulation, can increase joint laxity and injury risk — warm up thoroughly during this time.' }
    ],
    keyTakeaways: ['Energy peaks during the follicular phase', 'Gentle exercise helps during menstruation', 'Joint injury risk increases around ovulation', 'Late luteal phase calls for reduced intensity']
  },
  {
    id: 6, category: 'menstrual-cycle', title: 'Irregular Periods: Causes & Solutions',
    summary: 'Common reasons for irregular cycles and when irregularity needs medical attention.',
    readTime: '7 min', difficulty: 'Intermediate', views: 8901, likes: 678,
    content: [
      { heading: 'What Counts as Irregular?', text: 'A period is considered irregular if: cycles are shorter than 21 days or longer than 35 days, flow varies dramatically between cycles, you skip periods entirely (3+ months), periods last longer than 7 days, or you experience unexpected spotting between periods.' },
      { heading: 'Common Causes', text: '1. Stress — Disrupts GnRH signaling from the hypothalamus. 2. PCOS — Hormonal imbalance causes irregular or absent ovulation. 3. Thyroid disorders — Both hyper and hypothyroidism affect cycles. 4. Weight changes — Significant weight loss or gain disrupts hormones. 5. Perimenopause — Natural cycle changes as menopause approaches. 6. Medications — Birth control, blood thinners, antipsychotics.' },
      { heading: 'Natural Regulation Tips', text: 'Maintain a healthy weight (BMI 18.5-24.9). Manage stress through meditation and therapy. Exercise regularly but don\'t overdo it. Prioritize sleep (7-9 hours). Eat a balanced diet with enough healthy fats for hormone production.' },
      { heading: 'Medical Treatments', text: 'Hormonal birth control can regulate cycles. Metformin for PCOS-related irregularity. Thyroid medication for thyroid-related issues. Progesterone supplements to trigger periods. In severe cases, further investigation may be needed.' }
    ],
    quiz: [
      { q: 'What cycle length is considered too long?', options: ['Over 21 days', 'Over 28 days', 'Over 35 days', 'Over 42 days'], answer: 2, explanation: 'Cycles longer than 35 days are considered irregular and may warrant medical investigation.' },
      { q: 'Which condition is a common cause of irregular periods?', options: ['Anemia', 'PCOS', 'Hypertension', 'Diabetes'], answer: 1, explanation: 'PCOS (Polycystic Ovary Syndrome) is one of the most common causes of irregular periods due to hormonal imbalance.' }
    ],
    keyTakeaways: ['21-35 days is the normal range', 'Stress is a major cause of irregularity', 'PCOS is the most common medical cause', 'Consistent tracking helps identify patterns']
  }
]

const MYTHS = [
  { myth: 'You can\'t swim during your period.', reality: 'Swimming is safe and can actually help with cramps due to the water\'s pressure and warmth. Use a tampon, menstrual cup, or period swimwear.', icon: '🏊', category: 'hygiene' },
  { myth: 'You lose a lot of blood during your period.', reality: 'The average period loss is 30-80 mL total over the entire period — about 3-4 tablespoons. Heavy bleeding (menorrhagia) is a medical condition, not the norm.', icon: '🩸', category: 'anatomy' },
  { myth: 'PeriodSync: You shouldn\'t exercise during menstruation.', reality: 'Light to moderate exercise can reduce cramps and improve mood during your period. Listen to your body and adjust intensity as needed.', icon: '🏃', category: 'exercise' },
  { myth: 'PMS is "all in your head."', reality: 'PMS is caused by real hormonal fluctuations affecting neurotransmitters. PMDD is a recognized medical condition in the DSM-5.', icon: '🧠', category: 'mental-health' },
  { myth: 'You can\'t get pregnant during your period.', reality: 'While unlikely, pregnancy during menstruation is possible, especially with shorter cycles or longer periods. Sperm can survive up to 5 days.', icon: '👶', category: 'fertility' },
  { myth: 'Tampons can get "lost" inside you.', reality: 'The cervix prevents anything from passing through. The vaginal canal is only about 3-7 inches long. Tampons may shift position but cannot get lost.', icon: '🔬', category: 'hygiene' },
  { myth: 'You should avoid cold food and drinks during your period.', reality: 'There\'s no scientific evidence that cold food affects menstruation. Eat what makes you feel comfortable and well-nourished.', icon: '🧊', category: 'nutrition' },
  { myth: 'Period pain means you\'re infertile.', reality: 'Period pain does not indicate infertility. However, severe pain may signal conditions like endometriosis that could affect fertility — worth investigating.', icon: '💪', category: 'symptoms' }
]

const GLOSSARY = [
  { term: 'Dysmenorrhea', definition: 'Painful menstruation, especially severe menstrual cramps.' },
  { term: 'Anovulation', definition: 'A cycle where no egg is released from the ovary.' },
  { term: 'Endometrium', definition: 'The lining of the uterus that thickens and sheds during menstruation.' },
  { term: 'Corpus Luteum', definition: 'The empty follicle left after ovulation that produces progesterone.' },
  { term: 'Progesterone', definition: 'Hormone that maintains the uterine lining and supports early pregnancy.' },
  { term: 'Estrogen', definition: 'Primary female sex hormone that regulates the menstrual cycle.' },
  { term: 'FSH', definition: 'Follicle Stimulating Hormone — stimulates ovarian follicle growth.' },
  { term: 'LH', definition: 'Luteinizing Hormone — surge triggers ovulation.' },
  { term: 'PCOS', definition: 'Polycystic Ovary Syndrome — hormonal disorder causing irregular cycles.' },
  { term: 'PMDD', definition: 'Premenstrual Dysphoric Disorder — severe PMS variant.' },
  { term: 'Menorrhagia', definition: 'Abnormally heavy or prolonged menstrual bleeding.' },
  { term: 'Amenorrhea', definition: 'Absence of menstruation.' },
  { term: 'Metrorrhagia', definition: 'Irregular vaginal bleeding between periods.' },
  { term: 'Luteal Phase', definition: 'Second half of the cycle (after ovulation) when progesterone peaks.' },
  { term: 'Follicular Phase', definition: 'First half of the cycle when follicles develop and estrogen rises.' },
  { term: 'Perimenopause', definition: 'The transition period before menopause with changing cycle patterns.' }
]

// ─── Helper Components ────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, color }) {
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
        <div style={{ fontSize: '24px', fontWeight: 700, color: '#fff' }}>{value}</div>
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>{label}</div>
      </div>
    </div>
  )
}

function DifficultyBadge({ level }) {
  const colors = { Beginner: '#10b981', Intermediate: '#f59e0b', Advanced: '#ef4444' }
  return (
    <span style={{
      fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
      background: `${colors[level]}20`, color: colors[level], fontWeight: 600
    }}>{level}</span>
  )
}

function ProgressBar({ value, max = 100, color = '#6366f1' }) {
  return (
    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px' }}>
      <div style={{
        width: `${(value / max) * 100}%`, height: '100%', background: color,
        borderRadius: '3px', transition: 'width 0.3s'
      }} />
    </div>
  )
}

function QuizQuestion({ question, index, onAnswer, answered, selectedAnswer }) {
  const isCorrect = selectedAnswer === question.answer
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '20px',
      border: answered ? (isCorrect ? '1px solid #10b98140' : '1px solid #ef444440') : '1px solid rgba(255,255,255,0.06)',
      marginBottom: '12px'
    }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px', background: '#6366f120',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 700, color: '#818cf8', flexShrink: 0
        }}>{index + 1}</div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', lineHeight: 1.5 }}>{question.q}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {question.options.map((opt, i) => {
          const isAnswered = answered
          const isThis = selectedAnswer === i
          const isCorrectOption = i === question.answer
          let bg = 'rgba(255,255,255,0.03)'
          let border = '1px solid rgba(255,255,255,0.06)'
          let textColor = '#cbd5e1'
          if (isAnswered) {
            if (isCorrectOption) { bg = '#10b98120'; border = '1px solid #10b98140'; textColor = '#10b981' }
            else if (isThis && !isCorrectOption) { bg = '#ef444420'; border = '1px solid #ef444440'; textColor = '#ef4444' }
          }
          return (
            <button key={i} onClick={() => !answered && onAnswer(i)} disabled={answered} style={{
              padding: '12px 16px', borderRadius: '10px', background: bg, border,
              color: textColor, fontSize: '13px', textAlign: 'left', cursor: answered ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.2s'
            }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '6px',
                background: isAnswered && isCorrectOption ? '#10b98130' : isAnswered && isThis ? '#ef444430' : 'rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                {answered && isCorrectOption ? <CheckCircle size={14} color="#10b981" /> :
                  answered && isThis ? <XCircle size={14} color="#ef4444" /> :
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{String.fromCharCode(65 + i)}</span>}
              </div>
              {opt}
            </button>
          )
        })}
      </div>
      {answered && (
        <div style={{
          marginTop: '12px', padding: '12px', borderRadius: '10px',
          background: isCorrect ? '#10b98110' : '#f59e0b10',
          fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6
        }}>
          <strong style={{ color: isCorrect ? '#10b981' : '#f59e0b' }}>
            {isCorrect ? '✅ Correct! ' : '💡 Explanation: '}
          </strong>
          {question.explanation}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────

export default function HealthEncyclopedia() {
  const [activeTab, setActiveTab] = useState('articles')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [quizState, setQuizState] = useState({})
  const [quizSubmitted, setQuizSubmitted] = useState({})
  const [mythFilter, setMythFilter] = useState('all')
  const [glossarySearch, setGlossarySearch] = useState('')

  const tabs = [
    { id: 'articles', label: 'Articles', icon: BookOpen },
    { id: 'quizzes', label: 'Quizzes', icon: Brain },
    { id: 'myths', label: 'Myth Busters', icon: Lightbulb },
    { id: 'glossary', label: 'Glossary', icon: GraduationCap },
    { id: 'learn', label: 'Quick Learn', icon: Zap }
  ]

  const filteredArticles = useMemo(() => {
    let arts = [...ARTICLES]
    if (selectedCategory !== 'all') arts = arts.filter(a => a.category === selectedCategory)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      arts = arts.filter(a => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q))
    }
    return arts
  }, [selectedCategory, searchQuery])

  const filteredGlossary = useMemo(() => {
    if (!glossarySearch) return GLOSSARY
    const q = glossarySearch.toLowerCase()
    return GLOSSARY.filter(g => g.term.toLowerCase().includes(q) || g.definition.toLowerCase().includes(q))
  }, [glossarySearch])

  const quizScore = useMemo(() => {
    let total = 0, correct = 0
    ARTICLES.forEach(a => {
      a.quiz.forEach((q, i) => {
        total++
        if (quizSubmitted[`${a.id}-${i}`] && quizState[`${a.id}-${i}`] === q.answer) correct++
      })
    })
    return { total, correct, pct: total > 0 ? Math.round((correct / total) * 100) : 0 }
  }, [quizState, quizSubmitted])

  const handleQuizAnswer = useCallback((articleId, qIndex, answer) => {
    setQuizState(prev => ({ ...prev, [`${articleId}-${qIndex}`]: answer }))
    setQuizSubmitted(prev => ({ ...prev, [`${articleId}-${qIndex}`]: true }))
  }, [])

  const totalArticles = CATEGORIES.reduce((sum, c) => sum + c.articles, 0)
  const totalQuizzes = ARTICLES.reduce((sum, a) => sum + a.quiz.length, 0)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#fff', padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 8px' }}>
            📚 Health Encyclopedia
          </h1>
          <p style={{ fontSize: '16px', color: '#94a3b8', margin: '0' }}>
            Evidence-based menstrual health education — articles, quizzes, myth-busting, and interactive learning
          </p>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
          <KPICard icon={BookOpen} label="Total Articles" value={totalArticles.toString()} color="#6366f1" />
          <KPICard icon={Brain} label="Quiz Questions" value={totalQuizzes.toString()} color="#ec4899" />
          <KPICard icon={Lightbulb} label="Myths Busted" value={MYTHS.length.toString()} color="#f59e0b" />
          <KPICard icon={GraduationCap} label="Glossary Terms" value={GLOSSARY.length.toString()} color="#10b981" />
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)',
          borderRadius: '14px', padding: '4px', marginBottom: '24px',
          border: '1px solid rgba(255,255,255,0.06)'
        }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedArticle(null) }} style={{
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

        {/* ═══ Articles Tab ═══ */}
        {activeTab === 'articles' && !selectedArticle && (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '24px' }}>
            <div>
              <div style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
                padding: '18px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '16px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px' }}>Topics</h3>
                <button onClick={() => setSelectedCategory('all')} style={{
                  width: '100%', padding: '10px 12px', borderRadius: '10px',
                  background: selectedCategory === 'all' ? '#6366f120' : 'transparent',
                  border: selectedCategory === 'all' ? '1px solid #6366f140' : '1px solid transparent',
                  color: selectedCategory === 'all' ? '#818cf8' : '#94a3b8',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', marginBottom: '4px'
                }}>📋 All Topics</button>
                {CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{
                    width: '100%', padding: '8px 10px', borderRadius: '8px',
                    background: selectedCategory === cat.id ? `${cat.color}15` : 'transparent',
                    border: selectedCategory === cat.id ? `1px solid ${cat.color}30` : '1px solid transparent',
                    color: selectedCategory === cat.id ? cat.color : '#94a3b8',
                    fontSize: '12px', cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px'
                  }}>
                    <span>{cat.icon}</span>
                    <span style={{ flex: 1 }}>{cat.name}</span>
                    <span style={{ fontSize: '11px', opacity: 0.6 }}>{cat.articles}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{
                display: 'flex', gap: '12px', marginBottom: '16px',
                background: 'rgba(255,255,255,0.05)', borderRadius: '12px',
                padding: '10px 14px', alignItems: 'center',
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                <Search size={16} color="#64748b" />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search articles..."
                  style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: '13px', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredArticles.map(article => (
                  <div key={article.id} onClick={() => setSelectedArticle(article)} style={{
                    background: 'rgba(255,255,255,0.03)', borderRadius: '14px',
                    padding: '20px', border: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <DifficultyBadge level={article.difficulty} />
                      <span style={{ fontSize: '12px', color: '#64748b' }}>📖 {article.readTime}</span>
                    </div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>{article.title}</h3>
                    <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 12px', lineHeight: 1.5 }}>{article.summary}</p>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#64748b' }}>
                      <span>👁️ {article.views.toLocaleString()}</span>
                      <span>❤️ {article.likes}</span>
                      <span>🧠 {article.quiz.length} quiz questions</span>
                      <div style={{ flex: 1 }} />
                      <span style={{ color: '#6366f1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Read article <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Article Detail View ═══ */}
        {activeTab === 'articles' && selectedArticle && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <button onClick={() => setSelectedArticle(null)} style={{
              background: 'none', border: 'none', color: '#6366f1',
              fontSize: '13px', cursor: 'pointer', marginBottom: '16px',
              display: 'flex', alignItems: 'center', gap: '4px'
            }}>← Back to articles</button>
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '20px',
              padding: '32px', border: '1px solid rgba(255,255,255,0.06)'
            }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <DifficultyBadge level={selectedArticle.difficulty} />
                <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  📖 {selectedArticle.readTime}
                </span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>👁️ {selectedArticle.views.toLocaleString()}</span>
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 24px', lineHeight: 1.3 }}>{selectedArticle.title}</h2>
              {selectedArticle.content.map((section, i) => (
                <div key={i} style={{ marginBottom: '24px' }}>
                  <h3 style={{
                    fontSize: '16px', fontWeight: 700, color: '#6366f1',
                    margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px'
                  }}>
                    <span style={{
                      width: '24px', height: '24px', borderRadius: '6px', background: '#6366f120',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', flexShrink: 0
                    }}>{i + 1}</span>
                    {section.heading}
                  </h3>
                  <p style={{ fontSize: '14px', color: '#cbd5e1', margin: '0', lineHeight: 1.8 }}>{section.text}</p>
                </div>
              ))}
              {/* Key Takeaways */}
              <div style={{
                background: '#10b98110', borderRadius: '14px', padding: '20px',
                border: '1px solid #10b98130', marginTop: '24px'
              }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#10b981', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={16} /> Key Takeaways
                </h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#cbd5e1', lineHeight: 2 }}>
                  {selectedArticle.keyTakeaways.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
              {/* Quiz preview */}
              {selectedArticle.quiz.length > 0 && (
                <div style={{ marginTop: '24px' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Brain size={18} color="#ec4899" /> Test Your Knowledge
                  </h4>
                  {selectedArticle.quiz.map((q, qi) => (
                    <QuizQuestion key={qi} question={q} index={qi}
                      answered={!!quizSubmitted[`${selectedArticle.id}-${qi}`]}
                      selectedAnswer={quizState[`${selectedArticle.id}-${qi}`]}
                      onAnswer={(a) => handleQuizAnswer(selectedArticle.id, qi, a)} />
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button style={{
                  padding: '10px 18px', borderRadius: '10px', background: '#6366f120',
                  border: '1px solid #6366f140', color: '#818cf8', fontSize: '13px',
                  fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                }}><Bookmark size={14} /> Save</button>
                <button style={{
                  padding: '10px 18px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '13px',
                  fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                }}><Share2 size={14} /> Share</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Quizzes Tab ═══ */}
        {activeTab === 'quizzes' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {/* Score card */}
            <div style={{
              background: 'linear-gradient(135deg, #6366f115, #8b5cf615)',
              borderRadius: '16px', padding: '24px', marginBottom: '24px',
              border: '1px solid #6366f130', display: 'flex', alignItems: 'center', gap: '24px'
            }}>
              <div style={{
                width: '80px', height: '80px', borderRadius: '50%',
                background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '24px', fontWeight: 800, color: '#fff'
              }}>{quizScore.pct}%</div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>Quiz Progress</div>
                <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '4px' }}>
                  {quizScore.correct} / {quizScore.total} questions answered correctly
                </div>
                <div style={{ width: '300px', marginTop: '8px' }}>
                  <ProgressBar value={quizScore.correct} max={quizScore.total} color="#6366f1" />
                </div>
              </div>
              <div style={{ flex: 1 }} />
              {quizScore.pct >= 80 && (
                <div style={{
                  padding: '12px 20px', background: '#f59e0b20', borderRadius: '12px',
                  border: '1px solid #f59e0b40', textAlign: 'center'
                }}>
                  <Trophy size={24} color="#f59e0b" />
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#f59e0b', marginTop: '4px' }}>Health Scholar!</div>
                </div>
              )}
            </div>
            {ARTICLES.map(article => (
              <div key={article.id} style={{ marginBottom: '28px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    width: '28px', height: '28px', borderRadius: '8px', background: '#ec489920',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px'
                  }}>🧠</span>
                  {article.title}
                </h3>
                {article.quiz.map((q, qi) => (
                  <QuizQuestion key={qi} question={q} index={qi}
                    answered={!!quizSubmitted[`${article.id}-${qi}`]}
                    selectedAnswer={quizState[`${article.id}-${qi}`]}
                    onAnswer={(a) => handleQuizAnswer(article.id, qi, a)} />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ═══ Myth Busters Tab ═══ */}
        {activeTab === 'myths' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <button onClick={() => setMythFilter('all')} style={{
                padding: '8px 16px', borderRadius: '10px',
                background: mythFilter === 'all' ? '#f59e0b20' : 'rgba(255,255,255,0.03)',
                border: mythFilter === 'all' ? '1px solid #f59e0b40' : '1px solid rgba(255,255,255,0.06)',
                color: mythFilter === 'all' ? '#f59e0b' : '#94a3b8',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer'
              }}>All Myths ({MYTHS.length})</button>
              {[...new Set(MYTHS.map(m => m.category))].map(cat => (
                <button key={cat} onClick={() => setMythFilter(cat)} style={{
                  padding: '8px 16px', borderRadius: '10px',
                  background: mythFilter === cat ? '#f59e0b20' : 'rgba(255,255,255,0.03)',
                  border: mythFilter === cat ? '1px solid #f59e0b40' : '1px solid rgba(255,255,255,0.06)',
                  color: mythFilter === cat ? '#f59e0b' : '#94a3b8',
                  fontSize: '13px', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize'
                }}>{cat.replace('-', ' ')}</button>
              ))}
            </div>
            {MYTHS.filter(m => mythFilter === 'all' || m.category === mythFilter).map((myth, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
                padding: '24px', marginBottom: '14px',
                border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '32px' }}>{myth.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      fontSize: '13px', fontWeight: 600, color: '#ef4444', marginBottom: '8px'
                    }}>
                      <XCircle size={16} /> MYTH
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#ef4444', marginBottom: '16px' }}>{myth.myth}</div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      fontSize: '13px', fontWeight: 600, color: '#10b981', marginBottom: '8px'
                    }}>
                      <CheckCircle size={16} /> REALITY
                    </div>
                    <div style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.6 }}>{myth.reality}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Glossary Tab ═══ */}
        {activeTab === 'glossary' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{
              display: 'flex', gap: '12px', marginBottom: '20px',
              background: 'rgba(255,255,255,0.05)', borderRadius: '12px',
              padding: '10px 14px', alignItems: 'center',
              border: '1px solid rgba(255,255,255,0.08)'
            }}>
              <Search size={16} color="#64748b" />
              <input value={glossarySearch} onChange={e => setGlossarySearch(e.target.value)}
                placeholder="Search terms..."
                style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: '13px', outline: 'none' }} />
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden'
            }}>
              {filteredGlossary.map((g, i) => (
                <div key={g.term} style={{
                  padding: '16px 20px',
                  borderBottom: i < filteredGlossary.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  display: 'flex', gap: '16px', alignItems: 'flex-start'
                }}>
                  <div style={{
                    minWidth: '160px', fontSize: '14px', fontWeight: 700,
                    color: '#6366f1', paddingTop: '1px'
                  }}>{g.term}</div>
                  <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6 }}>{g.definition}</div>
                </div>
              ))}
              {filteredGlossary.length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
                  No terms found matching &ldquo;{glossarySearch}&rdquo;
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Quick Learn Tab ═══ */}
        {activeTab === 'learn' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>⚡ Quick Learning Cards</h3>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0' }}>Swipe through bite-sized health facts to build your knowledge</p>
            </div>
            {CATEGORIES.map(cat => (
              <div key={cat.id} style={{ marginBottom: '24px' }}>
                <h4 style={{
                  fontSize: '15px', fontWeight: 700, margin: '0 0 12px',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <span style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: `${cat.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px'
                  }}>{cat.icon}</span>
                  {cat.name}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {ARTICLES.filter(a => a.category === cat.id).slice(0, 3).map(article => (
                    <div key={article.id} onClick={() => { setActiveTab('articles'); setSelectedArticle(article) }} style={{
                      background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
                      padding: '16px', border: `1px solid ${cat.color}20`,
                      cursor: 'pointer', transition: 'all 0.2s'
                    }}>
                      <div style={{ fontSize: '11px', color: cat.color, fontWeight: 600, marginBottom: '6px' }}>
                        📖 {article.readTime}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', lineHeight: 1.4 }}>
                        {article.title}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                        {article.quiz.length} quiz questions →
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {/* Fun Facts */}
            <div style={{
              background: 'linear-gradient(135deg, #ec489910, #8b5cf610)',
              borderRadius: '16px', padding: '24px', border: '1px solid #ec489930',
              marginTop: '24px'
            }}>
              <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={18} color="#ec4899" /> Did You Know?
              </h4>
              {[
                'The average woman menstruates for about 7 years total in her lifetime.',
                'Menstrual blood is only about 3% blood — the rest is uterine tissue and mucus.',
                'Cycles can vary by 2-7 days from month to month and still be considered regular.',
                'The uterus contracts with a force similar to the heart — it\'s one of the strongest muscles.',
                'Period poverty affects 1 in 4 girls globally, impacting education and health.'
              ].map((fact, i) => (
                <div key={i} style={{
                  display: 'flex', gap: '10px', padding: '10px 0',
                  borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                }}>
                  <span style={{ color: '#ec4899', fontWeight: 700, fontSize: '14px' }}>💡</span>
                  <span style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6 }}>{fact}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
