"use client"
import { useState, useEffect } from "react"
import CardBasedText from "../cards/CardBasedText"
import CardSubHeader from "../cards/CardSubHeader"
import { X, CheckCircle2, XCircle, FileImage, ChevronLeft, ChevronRight } from "lucide-react"
import SideModal from "../Modal/SideModal"
import { supabase } from "@/supabase/util/supabase"
import SingleLineSkeleton from "../skeleton/SingleLineSkeleton"
import SquareSkeleton from "../skeleton/SquareSkeleton"

export default function VerificationTableModal({ data, onClose }) {
  const [imageError, setImageError] = useState(false)
  const [userName, setUserName] = useState("Loading...")
  const [isLoading, setIsLoading] = useState(true)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  // Reset image carousel state when the selected row changes
  useEffect(() => {
    setCurrentImageIndex(0)
    setImageError(false)
  }, [data?.id_verification_id])

  const images = [
    { url: data?.id_image_url, label: "ID Image" },
    { url: data?.selfie_url, label: "Selfie Image" }
  ].filter(img => img.url)

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
    setImageError(false)
  }

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
    setImageError(false)
  }

  useEffect(() => {
    async function fetchUserName() {
      setIsLoading(true)
      if (!data?.user_id) {
        setUserName("Unknown")
        setIsLoading(false)
        return
      }
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.user_id)
        .single()

      if (profile?.full_name) {
        setUserName(profile.full_name)
      } else {
        setUserName("Unknown")
      }
      setIsLoading(false)
    }
    fetchUserName()
  }, [data?.user_id])

  if (!data) return null;

  return (
    <SideModal className="z-50">
      <div className="p-6 flex flex-col h-full bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 shrink-0">
          <CardSubHeader>Verification Details</CardSubHeader>
          <button onClick={onClose} className="modal-icon-button">
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-6 space-y-6">
          
          {/* User Info */}
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wider">User Information</h4>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl">
              <div>
                <CardBasedText className="text-xs text-gray-500 mb-1">User Name</CardBasedText>
                {isLoading ? <div className="w-32 mt-1"><SingleLineSkeleton /></div> : <div className="font-medium text-sm text-gray-800">{userName}</div>}
              </div>
              <div className="overflow-hidden">
                <CardBasedText className="text-xs text-gray-500 mb-1">User ID</CardBasedText>
                {isLoading ? <div className="w-24 mt-1"><SingleLineSkeleton /></div> : <div className="font-medium text-xs text-gray-800 truncate" title={data.user_id}>{data.user_id}</div>}
              </div>
            </div>
          </div>

          {/* ID Details */}
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wider">ID Details</h4>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl mb-4">
              <div>
                <CardBasedText className="text-xs text-gray-500 mb-1">ID Type</CardBasedText>
                {isLoading ? <div className="w-24 mt-1"><SingleLineSkeleton /></div> : <div className="font-medium text-sm text-gray-800">{data.id_type}</div>}
              </div>
              <div className="overflow-hidden">
                <CardBasedText className="text-xs text-gray-500 mb-1">Verification ID</CardBasedText>
                {isLoading ? <div className="w-32 mt-1"><SingleLineSkeleton /></div> : <div className="font-medium text-xs text-gray-800 truncate" title={data.id_verification_id}>{data.id_verification_id}</div>}
              </div>
              <div>
                <CardBasedText className="text-xs text-gray-500 mb-1">Submitted At</CardBasedText>
                {isLoading ? <div className="w-32 mt-1"><SingleLineSkeleton /></div> : <div className="font-medium text-sm text-gray-800">{new Date(data.submitted_at).toLocaleString()}</div>}
              </div>
              <div>
                <CardBasedText className="text-xs text-gray-500 mb-1">Status</CardBasedText>
                {isLoading ? <div className="w-20 mt-1"><SingleLineSkeleton /></div> : (
                  <div className={`font-semibold text-sm ${data.status.toLowerCase() === 'verified' || data.status.toLowerCase() === 'approved' ? 'text-green-500' : data.status.toLowerCase() === 'pending' ? 'text-amber-500' : 'text-red-500'}`}>
                    {data.status ? data.status.charAt(0).toUpperCase() + data.status.slice(1) : ''}
                  </div>
                )}
              </div>
              <div>
                <CardBasedText className="text-xs text-gray-500 mb-1">Read Status</CardBasedText>
                {isLoading ? <div className="w-16 mt-1"><SingleLineSkeleton /></div> : <div className="font-medium text-sm text-gray-800">{data.is_read ? 'Read' : 'Unread'}</div>}
              </div>
              {data.reviewed_by && (
                <div className="overflow-hidden">
                  <CardBasedText className="text-xs text-gray-500 mb-1">Reviewed By</CardBasedText>
                  {isLoading ? <div className="w-24 mt-1"><SingleLineSkeleton /></div> : <div className="font-medium text-xs text-gray-800 truncate" title={data.reviewed_by}>{data.reviewed_by}</div>}
                </div>
              )}
            </div>

            {/* Image Carousel */}
            {isLoading ? (
              <div className="rounded-xl overflow-hidden h-48 w-full bg-gray-100 border border-gray-200">
                 <SquareSkeleton />
              </div>
            ) : images.length > 0 ? (
              <div className="relative rounded-xl border border-gray-200 overflow-hidden bg-gray-100 group min-h-48">
                {/* Header label for current image */}
                <div className="absolute top-0 left-0 right-0 bg-black/50 text-white text-xs font-medium px-3 py-1.5 text-center z-10 backdrop-blur-sm">
                  {images[currentImageIndex].label}
                </div>
                
                {imageError ? (
                  <div className="flex flex-col items-center justify-center h-48">
                    <FileImage className="size-10 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-500">Image failed to load</span>
                  </div>
                ) : (
                  <img
                    src={images[currentImageIndex].url}
                    alt={images[currentImageIndex].label}
                    className="w-full h-auto object-contain max-h-72"
                    onError={() => setImageError(true)}
                  />
                )}

                {/* Carousel Controls */}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={handlePrevImage}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 p-1.5 rounded-full shadow-sm transition-all opacity-0 group-hover:opacity-100 z-10"
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <button
                      onClick={handleNextImage}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 p-1.5 rounded-full shadow-sm transition-all opacity-0 group-hover:opacity-100 z-10"
                    >
                      <ChevronRight className="size-5" />
                    </button>
                    
                    {/* Dots indicator */}
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-10">
                      {images.map((_, idx) => (
                        <div 
                          key={idx} 
                          className={`h-1.5 rounded-full transition-all ${idx === currentImageIndex ? 'w-4 bg-blue-500' : 'w-1.5 bg-white/60'}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-100 flex flex-col items-center justify-center h-48">
                <FileImage className="size-10 text-gray-400 mb-2" />
                <span className="text-sm text-gray-500">No Images Available</span>
              </div>
            )}
          </div>

          {/* AI Insights */}
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wider">AI Analysis</h4>
            <div className="bg-gray-50 p-4 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardBasedText className="text-xs text-gray-500 mb-1">AI Validity Check</CardBasedText>
                  {isLoading ? <div className="w-24 mt-1"><SingleLineSkeleton /></div> : (
                    <div className="flex items-center gap-2">
                      {data.ai_is_valid ? (
                        <><CheckCircle2 className="size-4 text-green-500" /><span className="text-sm font-medium text-green-600">Valid Format</span></>
                      ) : (
                        <><XCircle className="size-4 text-red-500" /><span className="text-sm font-medium text-red-600">Invalid Format</span></>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <CardBasedText className="text-xs text-gray-500 mb-1">Confidence Score</CardBasedText>
                  {isLoading ? <div className="w-16 mt-1 ml-auto"><SingleLineSkeleton /></div> : (
                    <div className="text-lg font-bold text-gray-800">{data.ai_confidence_score != null ? `${Number(data.ai_confidence_score).toFixed(0)}%` : 'N/A'}</div>
                  )}
                </div>
              </div>
              
              <div className="pt-3 border-t border-gray-200">
                <CardBasedText className="text-xs text-gray-500 mb-1">AI Insight</CardBasedText>
                {isLoading ? <div className="w-full mt-1"><SingleLineSkeleton /></div> : (
                  <p className="text-sm text-gray-700 italic mt-1">"{data.ai_insight || 'No AI insight available'}"</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-gray-100 flex justify-end shrink-0">
          <button
            type="button"
            className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all cursor-pointer text-center"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </SideModal>
  )
}
