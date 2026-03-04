import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/AuthContext';

export interface TeamConfig {
  id: string;
  name: string;
  pin: string;
  members: string[];
  active: boolean;
}

export interface TeamSession {
  teamId: string;
  teamName: string;
  members: string[];
  isAdmin: boolean;
}

const LS_KEY = 'fireleads_team_pin';

export function useTeamAuth() {
  const { isOwner } = useAuth();
  const [session, setSession] = useState<TeamSession | null>(null);
  const [teams, setTeams] = useState<TeamConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all teams from Firestore on mount
  useEffect(() => {
    getDocs(collection(db, 'fire_lead_teams'))
      .then((snap) => {
        const t: TeamConfig[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TeamConfig, 'id'>),
        }));
        setTeams(t);

        // If owner, auto-grant admin session
        if (isOwner) {
          setSession({ teamId: 'admin', teamName: 'Admin', members: [], isAdmin: true });
          setLoading(false);
          return;
        }

        // Check for cached PIN
        const cachedPin = localStorage.getItem(LS_KEY);
        if (cachedPin) {
          const match = t.find((team) => team.pin === cachedPin && team.active);
          if (match) {
            setSession({
              teamId: match.id,
              teamName: match.name,
              members: match.members,
              isAdmin: match.id === 'admin',
            });
          }
        }
        setLoading(false);
      })
      .catch(() => {
        // If Firestore read fails, auto-grant admin for owner
        if (isOwner) {
          setSession({ teamId: 'admin', teamName: 'Admin', members: [], isAdmin: true });
        }
        setLoading(false);
      });
  }, [isOwner]);

  const authenticate = useCallback(
    async (pin: string): Promise<boolean> => {
      // Check against already-loaded teams first
      let match = teams.find((t) => t.pin === pin && t.active);

      // If teams haven't loaded yet, query Firestore directly
      if (!match) {
        const snap = await getDocs(
          query(collection(db, 'fire_lead_teams'), where('pin', '==', pin), where('active', '==', true))
        );
        if (!snap.empty) {
          const d = snap.docs[0];
          match = { id: d.id, ...(d.data() as Omit<TeamConfig, 'id'>) };
        }
      }

      if (match) {
        localStorage.setItem(LS_KEY, pin);
        setSession({
          teamId: match.id,
          teamName: match.name,
          members: match.members,
          isAdmin: match.id === 'admin',
        });
        return true;
      }
      return false;
    },
    [teams]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setSession(null);
  }, []);

  return { session, loading, authenticate, logout, teams };
}
