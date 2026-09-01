'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useAuth } from '@clerk/nextjs'
import { Bookmark, ArrowLeft, Loader2, AlertCircle } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import PostCard from '@/components/community/PostCard'
import fetchWithTimeout from '@/lib/fetch-with-timeout'

export default function SavedPostsPage() {
  const locale = useLocale()
  const t = useTranslations('Community')
  const { isLoaded, isSignedIn, getToken } = useAuth()

  const [posts, setPosts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSavedPosts = async () => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const token = await getToken()
      const res = await fetchWithTimeout('/api/forum/bookmarks', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || t('bookmark_error') || 'Failed to load saved posts')
      }

      setPosts(data.posts || [])
    } catch (err) {
      console.error('Error fetching saved posts:', err)
      setError(err.message || t('bookmark_error') || 'Failed to load saved posts')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSavedPosts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn])

  const handleBookmarkToggle = (postId, isBookmarked) => {
    if (!isBookmarked) {
      setPosts(prev => prev.filter(p => p.id !== postId))
    }
  }

  return (
    <div className="page">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Navigation & Header */}
        <div className="mb-6">
          <Link
            href={`/${locale}/community`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-pink-600 dark:text-pink-400 hover:underline mb-4"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{t('back_to_discussions') || 'Back to discussions'}</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-pink-100 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400 rounded-xl">
              <Bookmark size={24} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {t('saved_posts') || 'Saved Posts'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('view_saved_subtitle') || 'Your private collection of saved community discussions.'}
              </p>
            </div>
          </div>
        </div>

        {/* Content Section */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500 dark:text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            <span>{t('loading') || 'Loading saved posts…'}</span>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p>{error}</p>
              <button
                type="button"
                onClick={fetchSavedPosts}
                className="mt-1 font-medium underline underline-offset-2"
              >
                {t('retry') || 'Try again'}
              </button>
            </div>
          </div>
        ) : !isSignedIn ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <Bookmark className="mx-auto h-12 w-12 text-slate-400 mb-3" aria-hidden="true" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">
              {t('login_to_save') || 'Please sign in to view saved posts'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4">
              {t('login_to_save_desc') || 'Your saved discussions are private to your account.'}
            </p>
            <Link
              href={`/${locale}/auth/login`}
              className="inline-flex items-center px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg font-medium transition-colors"
            >
              {t('login') || 'Sign In'}
            </Link>
          </div>
        ) : posts.length > 0 ? (
          <div className="space-y-4">
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                locale={locale}
                initialIsBookmarked={true}
                onBookmarkToggle={(isBookmarked) => handleBookmarkToggle(post.id, isBookmarked)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <Bookmark className="mx-auto h-12 w-12 text-slate-400 mb-3" aria-hidden="true" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">
              {t('no_saved_posts') || 'You haven\'t saved any discussions yet'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4">
              {t('be_the_first_save') || 'Save posts by clicking the bookmark icon on any discussion.'}
            </p>
            <Link
              href={`/${locale}/community`}
              className="inline-flex items-center px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg font-medium transition-colors"
            >
              {t('browse_discussions') || 'Browse Discussions'}
            </Link>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
