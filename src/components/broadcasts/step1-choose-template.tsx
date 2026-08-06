'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import type { WhatsAppConfig } from '@/types';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, ArrowRight, Smartphone, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

const categoryColors: Record<string, string> = {
  Marketing: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Utility: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Authentication: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

interface Step1Props {
  selectedTemplate: MessageTemplate | null;
  onSelect: (template: MessageTemplate) => void;
  /** Which of the account's numbers (migration 039) to send from.
   *  Undefined until the user picks one (or the account only has one). */
  whatsappConfigId: string | null;
  onSelectNumber: (configId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step1ChooseTemplate({
  selectedTemplate,
  onSelect,
  whatsappConfigId,
  onSelectNumber,
  onNext,
  onBack,
}: Step1Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configs, setConfigs] = useState<WhatsAppConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);

  // Load the account's numbers first — an account with more than one
  // (migration 039) picks which one to send this broadcast from
  // before templates are even fetched, since templates are scoped to
  // a WABA and the picker filters the list below.
  useEffect(() => {
    async function fetchConfigs() {
      try {
        const res = await fetch('/api/whatsapp/config', { method: 'GET' });
        const data = await res.json();
        const list: WhatsAppConfig[] = Array.isArray(data.configs) ? data.configs : [];
        setConfigs(list);
        if (!whatsappConfigId && list.length > 0) {
          const def = list.find((c) => c.is_default) ?? list[0];
          onSelectNumber(def.id);
        }
      } catch (err) {
        console.error('Failed to load WhatsApp numbers:', err);
      } finally {
        setConfigsLoading(false);
      }
    }
    fetchConfigs();
    // Only on mount — `onSelectNumber`/`whatsappConfigId` intentionally
    // excluded so re-selecting doesn't re-trigger this fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedConfig = configs.find((c) => c.id === whatsappConfigId) ?? null;

  useEffect(() => {
    if (configsLoading) return;
    async function fetchTemplates() {
      try {
        setLoading(true);
        const supabase = createClient();
        // Only APPROVED templates can be sent via Meta — anything else
        // would 400 at broadcast time. Hide them rather than letting
        // the user pick a template that will fail. Scoped to the
        // selected number's WABA (migration 039) — a template
        // approved on one WABA isn't sendable from a number on
        // another.
        let query = supabase
          .from('message_templates')
          .select('*')
          .eq('status', 'APPROVED')
          .order('created_at', { ascending: false });
        if (selectedConfig?.waba_id) {
          query = query.eq('waba_id', selectedConfig.waba_id);
        }
        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        setTemplates(data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('chooseTemplate.errorLoad'));
      } finally {
        setLoading(false);
      }
    }

    fetchTemplates();
  }, [configsLoading, selectedConfig?.waba_id, t]);

  if (configsLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('chooseTemplate.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('chooseTemplate.subtitle')}
        </p>
      </div>

      {/* Sending number — only shown once the account has more than
          one (migration 039). With exactly one, it's auto-selected
          above and this section stays out of the way. */}
      {configs.length > 1 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">
            {t('chooseTemplate.chooseNumber')}
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {configs.map((config) => {
              const isSelected = config.id === whatsappConfigId;
              return (
                <button
                  key={config.id}
                  onClick={() => onSelectNumber(config.id)}
                  className={`flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border bg-card/50 hover:bg-card'
                  }`}
                >
                  <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {config.label || config.phone_number_id}
                    </span>
                  </span>
                  {config.is_default && (
                    <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-border bg-card/50">
          <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('chooseTemplate.noTemplates')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('chooseTemplate.createFirst')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const isSelected = selectedTemplate?.id === template.id;
            const catColor = categoryColors[template.category] ?? categoryColors.Utility;

            return (
              <button
                key={template.id}
                onClick={() => onSelect(template)}
                className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border bg-card/50 hover:border-border hover:bg-card'
                }`}
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-medium text-foreground">{template.name}</h3>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${catColor}`}
                  >
                    {template.category}
                  </span>
                </div>
                <p className="line-clamp-3 text-xs text-muted-foreground">{template.body_text}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{template.language ?? 'en_US'}</span>
                  {/* Status is omitted on purpose — every template
                      shown here is already filtered to APPROVED,
                      so the chip carried no information. */}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="outline" onClick={onBack} className="border-border text-muted-foreground">
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!selectedTemplate || !whatsappConfigId}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
