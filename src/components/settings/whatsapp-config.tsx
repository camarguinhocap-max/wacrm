'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  RotateCcw,
  Star,
  Trash2,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

type RegistrationProbe = {
  live: boolean;
  checks: Record<string, boolean | null>;
  errors?: string[];
  last_registration_error?: string | null;
  registered_at?: string | null;
  subscribed_apps_at?: string | null;
};

/**
 * Multi-number WhatsApp settings panel (migration 039). An account can
 * connect more than one number — this renders every one of them as a
 * row with its own connection/registration state and actions, plus a
 * form at the bottom to add another. Each add is a plain POST (create),
 * never an upsert-over-the-account's-only-row like the old single-
 * number version.
 */
export function WhatsAppConfig() {
  const t = useTranslations('Settings.whatsapp');
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<WhatsAppConfigType[]>([]);
  // Per-row transient UI state, keyed by config id.
  const [testingId, setTestingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<
    Record<string, { connected: boolean; message?: string; needsReset?: boolean }>
  >({});
  const [probes, setProbes] = useState<Record<string, RegistrationProbe>>({});

  const loadedAccountIdRef = useRef<string | null>(null);

  // Add-number form state.
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [label, setLabel] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const data = await res.json();
      setConfigs(Array.isArray(data.configs) ? data.configs : []);
    } catch (err) {
      console.error('fetchConfigs error:', err);
      toast.error('Failed to load WhatsApp configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      loadedAccountIdRef.current = null;
      setLoading(false);
      return;
    }
    if (loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    fetchConfigs();
  }, [authLoading, profileLoading, user?.id, accountId, fetchConfigs]);

  async function handleTestConnection(id: string) {
    setTestingId(id);
    try {
      const res = await fetch(`/api/whatsapp/config?id=${id}`, { method: 'GET' });
      const payload = await res.json();
      setLiveStatus((prev) => ({
        ...prev,
        [id]: {
          connected: Boolean(payload.connected),
          message: payload.message,
          needsReset: Boolean(payload.needs_reset),
        },
      }));
      if (payload.connected) {
        toast.success(
          payload.phone_info?.verified_name
            ? `Connected to ${payload.phone_info.verified_name}`
            : 'API connection successful'
        );
      } else {
        toast.error(payload.message || 'API connection failed');
      }
    } catch (err) {
      console.error('Test connection error:', err);
      toast.error('Connection test failed. Check network and try again.');
    } finally {
      setTestingId(null);
    }
  }

  async function handleVerifyRegistration(id: string) {
    setVerifyingId(id);
    try {
      const res = await fetch(`/api/whatsapp/config/verify-registration?id=${id}`, {
        method: 'GET',
      });
      const data = (await res.json()) as RegistrationProbe;
      setProbes((prev) => ({ ...prev, [id]: data }));
      if (data.live) {
        toast.success('Number is fully wired — Meta is delivering events.');
      } else {
        toast.error(
          'Number is not fully registered. See the checks below for which step failed.',
          { duration: 8000 },
        );
      }
      await fetchConfigs();
    } catch (err) {
      console.error('verify-registration failed:', err);
      toast.error('Could not reach the verification endpoint.');
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleSetDefault(id: string) {
    setSettingDefaultId(id);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, set_default: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to set default number');
        return;
      }
      toast.success('Default number updated.');
      await fetchConfigs();
    } catch (err) {
      console.error('set default error:', err);
      toast.error('Failed to set default number');
    } finally {
      setSettingDefaultId(null);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm(t('removeConfirm'))) return;
    setRemovingId(id);
    try {
      const res = await fetch(`/api/whatsapp/config?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to remove number');
        return;
      }
      toast.success('Number removed.');
      await fetchConfigs();
    } catch (err) {
      console.error('remove error:', err);
      toast.error('Failed to remove number');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleAddNumber() {
    if (!phoneNumberId.trim()) {
      toast.error('Phone Number ID is required');
      return;
    }
    if (!accessToken.trim()) {
      toast.error('Access Token is required');
      return;
    }

    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        pin: pin.trim() || null,
        label: label.trim() || null,
        access_token: accessToken.trim(),
      };

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save configuration');
        setSaving(false);
        return;
      }

      if (data.registered === false && data.registration_error) {
        toast.error(
          `Saved, but Meta couldn't register the number: ${data.registration_error}`,
          { duration: 12000 },
        );
      } else if (data.registration_skipped) {
        toast.success(
          'Credentials saved and verified. Inbound registration was skipped (no PIN).',
          { duration: 10000 },
        );
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Live — ${data.phone_info.verified_name} can now receive events.`
            : 'WhatsApp connected. Events will start flowing within a minute.',
        );
      }

      // Clear the form for the next add.
      setLabel('');
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken('');
      setPin('');
      await fetchConfigs();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead title={t('title')} description={t('description')} />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Connected numbers list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">{t('connectedNumbers')}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {t('connectedNumbersDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {configs.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('noNumbersYet')}</p>
              )}

              {configs.map((config) => {
                const isRegistered = Boolean(config.registered_at);
                const status = liveStatus[config.id];
                const probe = probes[config.id];
                return (
                  <div
                    key={config.id}
                    className="rounded-lg border border-border bg-card/60 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {config.label || config.phone_number_id}
                          </span>
                          {config.is_default && (
                            <Badge variant="default">{t('defaultBadge')}</Badge>
                          )}
                          {status?.connected === true && (
                            <Badge variant="outline" className="text-emerald-400 border-emerald-700/50">
                              <CheckCircle2 className="size-3" /> {t('credentialsValid')}
                            </Badge>
                          )}
                          {status?.connected === false && (
                            <Badge variant="destructive">
                              <XCircle className="size-3" /> {t('notConnected')}
                            </Badge>
                          )}
                          {isRegistered ? (
                            <Badge variant="outline" className="text-emerald-400 border-emerald-700/50">
                              {t('registered')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-400 border-amber-700/50">
                              {t('notRegistered')}
                            </Badge>
                          )}
                        </div>
                        {config.label && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {config.phone_number_id}
                          </p>
                        )}
                        {config.waba_id && (
                          <p className="text-xs text-muted-foreground">
                            WABA: {config.waba_id}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTestConnection(config.id)}
                          disabled={testingId === config.id}
                          className="border-border bg-transparent text-foreground hover:bg-muted h-7"
                        >
                          {testingId === config.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Zap className="size-3.5" />
                          )}
                          {t('testConnection')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleVerifyRegistration(config.id)}
                          disabled={verifyingId === config.id}
                          className="border-border bg-transparent text-foreground hover:bg-muted h-7"
                        >
                          {verifyingId === config.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Zap className="size-3.5" />
                          )}
                          {t('verifyWithMeta')}
                        </Button>
                        {!config.is_default && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetDefault(config.id)}
                            disabled={settingDefaultId === config.id}
                            className="border-border bg-transparent text-foreground hover:bg-muted h-7"
                          >
                            {settingDefaultId === config.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Star className="size-3.5" />
                            )}
                            {t('setDefault')}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemove(config.id)}
                          disabled={removingId === config.id}
                          className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40 h-7"
                        >
                          {removingId === config.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                          {t('removeNumber')}
                        </Button>
                      </div>
                    </div>

                    {status?.connected === false && status.message && (
                      <Alert className="bg-amber-950/30 border-amber-700/50 py-2">
                        <AlertDescription className="text-amber-100/80 text-xs">
                          {status.message}
                        </AlertDescription>
                      </Alert>
                    )}

                    {!isRegistered && config.last_registration_error && (
                      <p className="text-xs text-muted-foreground">
                        {t('lastAttemptFailed')}
                        <span className="text-red-300">
                          &quot;{config.last_registration_error}&quot;
                        </span>
                      </p>
                    )}

                    {probe && (
                      <div className="rounded border border-border bg-card/60 px-3 py-2 space-y-1.5 text-[11px]">
                        <p className="font-medium text-foreground">
                          {t('diagnosticLastRun')}
                          <span className={probe.live ? 'text-emerald-400' : 'text-amber-400'}>
                            {probe.live ? t('live') : t('notLive')}
                          </span>
                        </p>
                        <ul className="space-y-0.5 text-muted-foreground">
                          {Object.entries(probe.checks).map(([k, v]) => (
                            <li key={k} className="flex items-center gap-1.5">
                              {v === true ? (
                                <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                              ) : v === false ? (
                                <XCircle className="size-3 text-red-400 shrink-0" />
                              ) : (
                                <span className="size-3 rounded-full border border-border shrink-0" />
                              )}
                              <code className="text-muted-foreground">{k}</code>
                            </li>
                          ))}
                        </ul>
                        {(probe.errors ?? []).length > 0 && (
                          <ul className="pt-1 space-y-0.5 text-red-300">
                            {probe.errors?.map((e, i) => (
                              <li key={i}>• {e}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Add a new number */}
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">{t('addNumberTitle')}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {t('addNumberDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {t('labelField')}
                  <span className="ml-1 text-muted-foreground">{t('labelOptional')}</span>
                </Label>
                <Input
                  placeholder={t('labelPlaceholder')}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('phoneNumberId')}</Label>
                <Input
                  placeholder="e.g. 100234567890123"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('wabaId')}</Label>
                <Input
                  placeholder="e.g. 100234567890456"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('accessToken')}</Label>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    placeholder={t('accessTokenPlaceholder')}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('webhookVerifyToken')}</Label>
                <Input
                  placeholder={t('webhookVerifyTokenPlaceholder')}
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">{t('webhookVerifyTokenHint')}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {t('twoStepPin')}
                  <span className="ml-1 text-muted-foreground">{t('optional')}</span>
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t('pinPlaceholder')}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground tracking-widest"
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span dangerouslySetInnerHTML={{ __html: t('pinHint') }} />
                </p>
              </div>

              <Button
                onClick={handleAddNumber}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('saving')}
                  </>
                ) : (
                  <>
                    <Plus className="size-4" />
                    {t('addNumberButton')}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Webhook URL */}
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">{t('webhookTitle')}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {t('webhookDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('webhookUrl')}</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={webhookUrl}
                    className="bg-muted border-border text-muted-foreground font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyWebhookUrl}
                    className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Setup Instructions Sidebar */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground text-base">{t('setupInstructions')}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {t('setupInstructionsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion>
                <AccordionItem className="border-border">
                  <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                    <span className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                      {t('step1')}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li dangerouslySetInnerHTML={{ __html: t('step1_1') }} />
                      <li>{t('step1_2')}</li>
                      <li>{t('step1_3')}</li>
                      <li>{t('step1_4')}</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem className="border-border">
                  <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                    <span className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                      {t('step2')}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>{t('step2_1')}</li>
                      <li>{t('step2_2')}</li>
                      <li>{t('step2_3')}</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem className="border-border">
                  <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                    <span className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                      {t('step3')}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>{t('step3_1')}</li>
                      <li dangerouslySetInnerHTML={{ __html: t('step3_2') }} />
                      <li dangerouslySetInnerHTML={{ __html: t('step3_3') }} />
                      <li dangerouslySetInnerHTML={{ __html: t('step3_4') }} />
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem className="border-border">
                  <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                    <span className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                      {t('step4')}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>{t('step4_1')}</li>
                      <li>{t('step4_2')}</li>
                      <li dangerouslySetInnerHTML={{ __html: t('step4_3') }} />
                      <li dangerouslySetInnerHTML={{ __html: t('step4_4') }} />
                      <li>{t('step4_5')}</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="mt-4 pt-4 border-t border-border">
                <a
                  href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  <ExternalLink className="size-3.5" />
                  {t('metaDocs')}
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
