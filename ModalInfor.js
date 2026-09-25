
import SideModal from "@/components/Modal/SideModal"
import CardHeader from "@/components/cards/CardHeader"
import CardSubHeader from "@/components/cards/CardSubHeader"
import CardBasedText from "@/components/cards/CardBasedText"
import { X,User,MapPin,Network,MonitorSmartphone,Link,EarthLock, Clock } from "lucide-react"
import { IdCard } from "lucide-react"

export default function ModalInfor({ log, onClose }) {
  if (!log) return null;

  const email = log.profiles?.email || "Unknown";
  const fullName = log.profiles?.full_name || "Unknown";
  const role = (log.profiles?.role || "Unknown").replace(/_/g, ' ');
  const status = log.status || "Unknown";
  const isVpn = log.is_vpn ? "True" : "False";
  const blockReason = log.block_reason || "None";
  const loginTime = log.login_time ? new Date(log.login_time).toLocaleString() : "Unknown";

  return (
    <SideModal className='p-3'>
        <div className="grid gap-3 py-2">
        <div className="flex bg-white sticky top-0 items-center gap-2">
            <button onClick={onClose} className=" modal-icon-button"><X/></button>
            <CardHeader className=''>Logs and Activity</CardHeader>
        </div>
        <div className="text-gray-500">
            <CardSubHeader>Activity Information</CardSubHeader>
        </div>
        <div className="info-card"> 
        <div className="flex items-start gap-2">
            <span className="summary-data-icon">
                <User/>
            </span>
            <div className="flex justify-between items-start w-full">
                <div>
                <CardBasedText className='text-gray-500 font-semibold'>Email</CardBasedText>
                <CardSubHeader>{email}</CardSubHeader>
                </div>
                <span>
                    {status === 'success' ? (
                        <CardBasedText className='default-banner-green text-xs'>Success</CardBasedText>
                    ) : (
                        <CardBasedText className='bg-red-100 text-red-700 px-2 py-1 rounded-md text-xs font-semibold capitalize'>Blocked</CardBasedText>
                    )}
                </span>
            </div>
        </div>
        <span className="bg-gray-200 w-full h-[1px]"/>
        <div className="grid grid-cols-2 gap-y-5">
        <div className="flex items-start gap-2">
            <MapPin className="size-5 text-gray-500"/>
            <div>
                <CardBasedText className='font-semibold text-gray-500'>Location</CardBasedText>
                <CardBasedText className='text-xs'>{log.login_location || "Unknown"}</CardBasedText>
            </div>
        </div>
        <div className="flex items-start gap-2">
            <Network className="size-5 text-gray-500"/>
            <div>
                <CardBasedText className='font-semibold text-gray-500'>IP address</CardBasedText>
                <CardBasedText className='text-xs'>{log.ip_address || "Unknown"}</CardBasedText>
            </div>
        </div>
        <div className="flex items-start gap-2">
            <MonitorSmartphone className="size-5 text-gray-500"/>
            <div>
                <CardBasedText className='font-semibold text-gray-500'>Device Info</CardBasedText>
                <CardBasedText className='text-xs'>{log.device_info || "Unknown"}</CardBasedText>
            </div>
        </div>
        <div className="flex items-start gap-2">
            <EarthLock className="size-5 text-gray-500"/>
            <div>
                <CardBasedText className='font-semibold text-gray-500'>VPN Detected</CardBasedText>
                <CardBasedText className='text-xs'>{isVpn}</CardBasedText>
            </div>
        </div>
        <div className="flex items-start gap-2">
            <Clock className="size-5 text-gray-500"/>
            <div>
                <CardBasedText className='font-semibold text-gray-500'>Logged at</CardBasedText>
                <CardBasedText className='text-xs'>{loginTime}</CardBasedText>
            </div>
        </div>
         <div className="flex items-start gap-2">
            <Link className="size-5 text-gray-500"/>
            <div>
                <CardBasedText className='font-semibold text-gray-500'>Logged Location</CardBasedText>
                <CardBasedText className='text-xs'>{log.login_location || "Unknown"}</CardBasedText>
            </div>
        </div>
        </div>
        </div>
        <div className="info-card">
        <div>
        <CardSubHeader className='text-gray-500'>Block Reason</CardSubHeader>
        <CardBasedText>{blockReason}</CardBasedText>
        </div>
        </div>
        <CardSubHeader className='text-gray-500'>Account Information</CardSubHeader>
        <div className="info-card grid grid-cols-2 gap-y-5">
            <div className="flex items-start gap-2">
            <User className="size-5 text-gray-500"/>
            <div>
                <CardBasedText className='font-semibold text-gray-500'>Full Name</CardBasedText>
                <CardBasedText className='text-xs'>{fullName}</CardBasedText>
            </div>
        </div>
        <div className="flex items-start gap-2">
            <IdCard className="size-5 text-gray-500"/>
            <div>
                <CardBasedText className='font-semibold text-gray-500'>Role</CardBasedText>
                <CardBasedText className='text-xs capitalize'>{role}</CardBasedText>
            </div>
        </div>
        </div>
        </div>
    </SideModal>
  )
}

