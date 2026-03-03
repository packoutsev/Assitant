export interface CalendarInfo {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  foreground_color: string | null;
  primary: boolean;
  access_role: string;
  selected: boolean;
}

export interface CalendarEvent {
  id: string;
  calendar_id: string;
  title: string;
  start: string | null;
  end: string | null;
  all_day: boolean;
  location: string | null;
  description: string | null;
  status: string;
  color: string | null;
  html_link: string | null;
}
