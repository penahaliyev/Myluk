import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, User, Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchApi } from '../lib/utils';
import { WardrobeItem, UserProfile } from '../lib/hooks';

export function FloatingChat({ wardrobeItems, profile }: { wardrobeItems: WardrobeItem[], profile: UserProfile | null }) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user'|'assistant', content: string}[]>([
    { role: 'assistant', content: t('chat_greeting', 'Hi! I am your AI stylist. Feel free to ask me anything about your wardrobe.') }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    
    const newMsg = { role: 'user' as const, content: input.trim() };
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setLoading(true);

    try {
      const data = await fetchApi('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           messages: [...messages, newMsg].map(m => ({ role: m.role, content: m.content })),
           wardrobeItems,
           language: i18n.language,
           profile
        })
      });
      if (data.text) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'assistant', content: t('error', 'Error processing request') }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 w-14 h-14 bg-[#6b8555] rounded-full flex items-center justify-center shadow-xl shadow-[#6b8555]/20 hover:scale-110 transition-transform z-40 ${isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
      >
        <MessageCircle className="text-white w-6 h-6" />
      </button>

      {/* Chat Window */}
      <div 
        className={`fixed bottom-0 right-0 sm:bottom-6 sm:right-6 w-full sm:w-96 h-[80vh] sm:h-[600px] bg-[#eef2e6] border-t sm:border border-[#d2d9c8] sm:rounded-3xl shadow-2xl flex flex-col z-50 transition-all duration-300 transform origin-bottom-right ${isOpen ? 'scale-100 opacity-100' : 'scale-75 opacity-0 pointer-events-none'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#d2d9c8] bg-slate-800/50 sm:rounded-t-3xl">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-[#6b8555] flex items-center justify-center">
                <Bot size={16} className="text-white" />
             </div>
             <div>
                <h3 className="text-sm font-black text-[#2b3327] uppercase tracking-widest">AI Stylist</h3>
                <p className="text-[10px] text-[#556943] font-bold uppercase tracking-widest">Online</p>
             </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="p-2 text-[#6b7863] hover:text-[#2b3327] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-4">
           {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}>
                 <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${msg.role === 'user' ? 'bg-[#d2d9c8]' : 'bg-[#6b8555]'}`}>
                    {msg.role === 'user' ? <User size={12} className="text-[#2b3327]" /> : <Bot size={12} className="text-white" />}
                 </div>
                 <div className={`p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-[#d2d9c8] text-[#2b3327] rounded-tr-none' : 'bg-white text-[#384232] rounded-tl-none border border-[#d2d9c8]'}`}>
                    {msg.content}
                 </div>
              </div>
           ))}
           {loading && (
             <div className="flex gap-3 max-w-[85%] self-start opacity-70">
                 <div className="w-6 h-6 rounded-full bg-[#6b8555] flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot size={12} className="text-white" />
                 </div>
                 <div className="p-3 bg-white rounded-2xl rounded-tl-none text-sm text-[#6b7863] font-mono italic animate-pulse">
                    Typing...
                 </div>
              </div>
           )}
           <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-[#d2d9c8] bg-slate-800/50 sm:rounded-b-3xl">
           <div className="flex bg-[#eef2e6] border border-[#d2d9c8] rounded-full p-1 pl-4 items-center">
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder={t('chat_placeholder', 'Ask about your style...')}
                className="flex-1 bg-transparent border-none outline-none text-sm text-[#2b3327] placeholder-slate-500"
              />
              <button onClick={sendMessage} disabled={!input.trim() || loading} className="w-10 h-10 rounded-full bg-[#6b8555] hover:bg-[#556943] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white">
                 <Send size={16} className="-ml-0.5 mt-0.5" />
              </button>
           </div>
        </div>
      </div>
    </>
  );
}
