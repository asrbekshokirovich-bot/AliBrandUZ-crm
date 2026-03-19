import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Bot, Send, User, Loader2, X, ChevronDown, ChevronUp,
  TrendingUp, Package, RotateCcw, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

const QUICK_QUESTIONS = [
  'Hozir Uzumda qancha tovar bor?',
  'Yandex da o\'tgan oyda daromad qancha?',
  'Eng ko\'p sotiladigan mahsulot qaysi?',
  'Vozvrat ko\'p bo\'lgan mahsulotlar?',
  'Ombordagi tovar qiymati jami?',
  'Qaysi do\'konda zarar bor?',
];

interface InventoryAIChatProps {
  defaultOpen?: boolean;
}

export function InventoryAIChat({ defaultOpen = false }: InventoryAIChatProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'ai',
      text: 'Salom! Men sizning ombor va moliyaviy AI yordamchingizman.\n\n🔹 Ombordagi tovar qoldig\'ini so\'rang\n🔹 Har bir do\'kondagi daromad/zararni so\'rang\n🔹 Vozvrat tahlilini so\'rang\n\nSavolingizni yozing, men javob beraman!',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: text.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('inventory-ai-query', {
        body: { question: text.trim() },
      });

      if (error) throw error;

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'ai',
        text: data?.answer ?? 'Javob olishda xatolik yuz berdi.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Xatolik';
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: 'ai',
        text: `❌ Xatolik: ${message}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Chat Panel */}
      {open && (
        <Card className="w-[420px] h-[560px] flex flex-col shadow-2xl border border-border/60 bg-background/95 backdrop-blur-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-gradient-to-r from-primary/10 to-purple-500/10 shrink-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Ombor AI</p>
              <p className="text-[11px] text-muted-foreground">Tovar hisobi · Daromad · Vozvratlar</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={cn('flex gap-2', msg.role === 'user' && 'flex-row-reverse')}
              >
                {/* Avatar */}
                <div className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5',
                  msg.role === 'ai' ? 'bg-primary/15' : 'bg-muted',
                )}>
                  {msg.role === 'ai'
                    ? <Bot className="h-3.5 w-3.5 text-primary" />
                    : <User className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>

                {/* Bubble */}
                <div className={cn(
                  'max-w-[80%] rounded-2xl px-3 py-2.5 text-sm',
                  msg.role === 'ai'
                    ? 'bg-muted text-foreground rounded-tl-sm'
                    : 'bg-primary text-primary-foreground rounded-tr-sm',
                )}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  <p className={cn(
                    'text-[10px] mt-1',
                    msg.role === 'ai' ? 'text-muted-foreground' : 'text-primary-foreground/60',
                  )}>
                    {msg.timestamp.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick questions */}
          <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
            {QUICK_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={isLoading}
                className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20 shrink-0"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex items-end gap-2 px-3 pb-3 pt-1 border-t border-border shrink-0">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="So'roq yozing... (Enter = yuborish)"
              rows={2}
              disabled={isLoading}
              className="flex-1 resize-none rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground disabled:opacity-50"
            />
            <Button
              size="sm"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="h-9 w-9 p-0 rounded-xl shrink-0"
            >
              {isLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </Card>
      )}

      {/* Toggle Button */}
      <Button
        onClick={() => setOpen(v => !v)}
        className="h-14 w-14 rounded-full shadow-lg gap-0 p-0 relative"
      >
        {open
          ? <ChevronDown className="h-6 w-6" />
          : <Sparkles className="h-6 w-6" />}
        {!open && messages.length > 1 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
        )}
      </Button>
    </div>
  );
}
