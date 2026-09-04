import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  deleteNetworkProfile,
  listNetworkSettings,
  MAX_HOST_CONCURRENCY,
  saveNetworkProfile,
  setLibraryProfile,
  setLibrarySizePolicy,
  type NetworkSettings,
  type NetworkValues,
  type SizePolicy,
} from '../services/downloadSettingsService';

/** I valori di un profilo nuovo: il ritmo prudente, che è quello di partenza. */
export const NEW_PROFILE_VALUES: NetworkValues = {
  burstRequests: 240,
  burstWindowSecs: 60,
  cooldown403Secs: 120,
  cooldown429Secs: 120,
  hostConcurrency: MAX_HOST_CONCURRENCY,
  workersPerJob: 2,
  maxAttempts: 5,
  backoffBaseSecs: 15,
  backoffCapSecs: 300,
  connectTimeoutSecs: 15,
  readTimeoutSecs: 30,
  needsViewerWarmup: false,
};

/**
 * Quello che si sta scrivendo, con il profilo a cui appartiene (`id` nullo = un
 * profilo nuovo). Lo tiene la finestra, non la scheda: la scheda si smonta
 * cambiando linguetta, e un ritmo digitato a metà spariva senza dire niente.
 */
export interface NetworkProfileDraft {
  id: string | null;
  name: string;
  values: NetworkValues;
}

/**
 * Profili di rete e scelte per biblioteca, letti e scritti in un punto solo.
 *
 * Sta qui perché le due sezioni che li mostrano — l'elenco delle biblioteche e
 * la modifica dei profili — non sono più vicine nella schermata: due copie
 * dello stesso stato avrebbero mostrato conteggi diversi dopo un salvataggio.
 */
export function useLibraryNetworkSettings(editingProfileId: string | null = null) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<NetworkSettings>({ profiles: [], libraries: [] });
  // Si parte dal profilo della bozza, quando ce n'è una: la bozza vive nella
  // finestra e sopravvive al cambio di scheda, mentre questo stato no —
  // tornando indietro si vedeva scelto il primo profilo con i campi di un
  // altro.
  const [activeId, setActiveId] = useState<string | null>(editingProfileId);

  const reportFailure = useCallback(
    (key: string, error: unknown) => {
      toast.error(t(key), {
        description: error instanceof Error ? error.message : String(error),
      });
    },
    [t],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await listNetworkSettings();
        setSettings(loaded);
        setActiveId((current) => current ?? loaded.profiles[0]?.id ?? null);
      } catch (error: unknown) {
        reportFailure('settings.network.loadFailed', error);
      }
    };
    void load();
  }, [reportFailure]);

  const saveProfile = useCallback(
    async (draft: NetworkProfileDraft): Promise<boolean> => {
      const name = draft.name.trim();
      if (name === '') return false;
      try {
        const known = new Set(settings.profiles.map((profile) => profile.id));
        const saved = await saveNetworkProfile({ id: draft.id, name, values: draft.values });
        setSettings(saved);
        // Il profilo appena nato è quello con l'identificativo che prima non
        // c'era: cercarlo per nome sbaglierebbe fra due profili omonimi.
        if (draft.id === null) {
          setActiveId(saved.profiles.find((profile) => !known.has(profile.id))?.id ?? activeId);
        }
        toast.success(t('settings.network.saved'));
        return true;
      } catch (error: unknown) {
        reportFailure('settings.network.saveFailed', error);
        return false;
      }
    },
    [activeId, reportFailure, settings.profiles, t],
  );

  const removeProfile = useCallback(
    async (id: string) => {
      try {
        const saved = await deleteNetworkProfile(id);
        setSettings(saved);
        setActiveId(saved.profiles[0]?.id ?? null);
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        toast.error(
          reason.includes('profile_in_use')
            ? t('settings.network.deleteInUse')
            : t('settings.network.saveFailed'),
        );
      }
    },
    [t],
  );

  const chooseProfile = useCallback(
    async (libraryKey: string, profileId: string) => {
      try {
        setSettings(await setLibraryProfile(libraryKey, profileId));
      } catch (error: unknown) {
        reportFailure('settings.network.saveFailed', error);
      }
    },
    [reportFailure],
  );

  const chooseSizePolicy = useCallback(
    async (libraryKey: string, policy: SizePolicy) => {
      try {
        setSettings(await setLibrarySizePolicy(libraryKey, policy));
      } catch (error: unknown) {
        reportFailure('settings.network.saveFailed', error);
      }
    },
    [reportFailure],
  );

  return {
    settings,
    activeId,
    setActiveId,
    saveProfile,
    removeProfile,
    chooseProfile,
    chooseSizePolicy,
  };
}
