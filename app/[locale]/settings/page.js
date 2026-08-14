'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClerk, useUser } from '@clerk/nextjs'
import Navbar from '@/components/layout/Navbar'
import ConfirmationModal from '@/components/modals/ConfirmationModal'
import toast from 'react-hot-toast'
import { Download, AlertTriangle, Trash2, Shield } from 'lucide-react'
import PartnerSharing from '@/components/settings/PartnerSharing'
import NotificationSettings from '@/components/layout/NotificationSettings'
import { useTranslations } from 'next-intl'

export default function SettingsPage() {
  const t = useTranslations('PrivacyData')
  const router = useRouter()
  const { user } = useUser()
  const { signOut } = useClerk()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const handleExportData = async () => {
    setIsExporting(true)
    const toastId = toast.loading('Preparing your export...')
    try {
      const res = await fetch('/api/user/export')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'hercycle-health-data.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Data exported successfully!', { id: toastId })
    } catch (error) {
      console.error(error)
      toast.error('Failed to export data. Please try again.', { id: toastId })
    } finally {
      setIsExporting(false)
    }
  }

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    const toastId = toast.loading('Deleting account...')
    try {
      // Delete user via Clerk client / backend API
      if (user?.delete) {
        await user.delete()
      } else {
        const res = await fetch('/api/delete-account', { method: 'POST' })
        if (!res.ok) throw new Error('Failed to delete account via API')
      }
      await signOut()
      toast.success('Account deleted successfully.', { id: toastId })
      setIsDeleteModalOpen(false)
      router.push('/')
    } catch (error) {
      console.error(error)
      toast.error('Failed to delete account. Please try again.', { id: toastId })
      setIsDeleting(false)
    }
  }

  return (
    <div className="page flex flex-col min-h-screen">
      <Navbar />

      <div className="flex-1 flex flex-col justify-center items-center w-full max-w-2xl mx-auto px-4 pb-20 pt-6">
        <div className="w-full space-y-6">
          <h1 className="text-3xl font-bold text-white mb-6 text-center sm:text-left">{t('title')}</h1>

          {/* Notification Settings Section */}
          <div className="glass rounded-3xl p-2 sm:p-4 shadow-2xl">
            <NotificationSettings />
          </div>

          <div className="glass p-6 sm:p-8 rounded-3xl space-y-8 shadow-2xl relative overflow-hidden">
            {/* Subtle glow behind the card */}
            <div className="absolute top-[-50%] right-[-50%] w-[100%] h-[100%] bg-white/5 blur-3xl rounded-full pointer-events-none"></div>

            <PartnerSharing />
            <hr className="border-white/10 relative z-10" />

            {/* Privacy & Data Settings Trigger */}
            <section className="space-y-4 relative z-10">
              <h2 className="text-xl font-semibold text-white">{t('exportTitle')}</h2>
              <p className="text-white/70 text-sm">
                {t('exportDesc')}
              </p>
              <button 
                onClick={handleExportData}
                disabled={isExporting}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl transition-colors font-medium disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isExporting ? t('exporting') : t('exportBtn')}
              </button>
            </section>

            <hr className="border-white/10 relative z-10" />

            {/* Account Deletion Section */}
            <section className="space-y-4 relative z-10">
              <h2 className="text-xl font-semibold text-red-400">{t('dangerZone')}</h2>
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-3">
                  <h3 className="font-semibold text-red-300">{t('deleteTitle')}</h3>
                  <p className="text-red-300/70 text-sm leading-relaxed">
                    {t('deleteDesc')}
                  </p>
                  <button 
                    onClick={() => setIsDeleteModalOpen(true)}
                    disabled={isDeleting}
                    className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 px-5 py-2.5 rounded-xl transition-colors font-medium border border-red-500/30 mt-2 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {isDeleting ? t('deleting') : t('deleteBtn')}
                  </button>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title={t('deleteModalTitle')}
        description={t('deleteModalDesc')}
        keyword={t('deleteModalKeyword')}
        confirmText={t('deleteBtn')}
        cancelText={t('cancelBtn')}
        inputPlaceholder={t('deleteModalPlaceholder')}
        isLoading={isDeleting}
        isDanger={true}
      />
    </div>
  )
}


