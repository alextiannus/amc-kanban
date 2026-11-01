'use client'
import {useRouter} from 'next/navigation'
import {useI18n} from '@/lib/i18n'
import PersonalAiTokens from '@/components/profile/PersonalAiTokens'
export default function Page(){const router=useRouter(),{isEn}=useI18n();return <PersonalAiTokens english={isEn} onBack={()=>router.push('/profile')}/>}
