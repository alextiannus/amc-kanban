'use client'
import {useEffect,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
// Fullscreen editors must escape dashboard transforms and stacking contexts.
export default function EditorPortal({children}:{children:ReactNode}){
 const [mounted,setMounted]=useState(false)
 useEffect(()=>setMounted(true),[])
 return mounted?createPortal(children,document.body):null
}
