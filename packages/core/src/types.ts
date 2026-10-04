export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place extends LatLng {
  /** What the member called it, e.g. "Duffield". Never posted to the group. */
  label: string;
}

export interface Member {
  id: string;
  name: string;
  /** iMessage handle: phone number or Apple ID email. */
  handle: string;
  nessieAccountId?: string;
  calendarId?: string;
  location?: Place;
}

export interface Group {
  chatId: string;
  members: Member[];
  organizerId: string;
}

export type BookingMethod = "phone" | "walk-in";

export interface Venue {
  id: string;
  /** Nessie merchant id once seeded. */
  merchantId?: string;
  name: string;
  cuisine: string;
  neighborhood: Neighborhood;
  address: string;
  location: LatLng;
  phone: string;
  /** 1 = under $12, 2 = $12–20, 3 = $20–35, 4 = $35+ */
  priceLevel: 1 | 2 | 3 | 4;
  /** Typical spend per person in dollars, used for the budget filter. */
  typicalSpend: number;
  bookingMethod: BookingMethod;
  /** Local opening hours, 24h "HH:MM". Close may be past midnight, e.g. "01:00". */
  hours: { open: string; close: string };
  /** Activities this venue suits. */
  serves: Activity[];
}

export type Neighborhood = "Collegetown" | "The Commons" | "Campus" | "North Campus" | "Downtown";

export type Activity = "breakfast" | "lunch" | "dinner" | "coffee" | "drinks" | "dessert";

export interface Interval {
  start: Date;
  end: Date;
}

export interface PlanRequest {
  activity: Activity;
  /** Window the meal may start in. */
  window: Interval;
  budgetPerPerson?: number;
  partySize: number;
  /** Member id → what they said about where they are. */
  statedLocations: Record<string, string>;
  constraints: PlanConstraints;
}

export interface PlanConstraints {
  neighborhood?: Neighborhood;
  /** Preferred start time; the planner picks the valid slot closest to it. */
  preferredTime?: Date;
  /** Cap on anyone's walk, in minutes. */
  maxWalkMinutes?: number;
  cuisine?: string;
  excludeVenueIds: string[];
  seating?: string;
  accessibility?: string;
}

export interface TravelLeg {
  memberId: string;
  minutes: number;
  departAt: Date;
}

export interface PlanOption {
  venue: Venue;
  time: Date;
  legs: TravelLeg[];
  /** Longest walk in the group, in minutes. The planner minimizes this. */
  maxTravel: number;
  totalTravel: number;
  /** Members with no linked calendar, assumed free. */
  assumedFree: string[];
}

export type PlanStatus = "proposed" | "approved" | "booking" | "locked" | "cancelled";

export interface Plan {
  id: string;
  chatId: string;
  request: PlanRequest;
  option: PlanOption;
  backups: PlanOption[];
  status: PlanStatus;
  round: number;
  /** Message guid of the proposal, so tapbacks can be matched to it. */
  proposalMessageId?: string;
  approvals: string[];
  createdAt: Date;
}

export type CallStatus = "dialing" | "in-progress" | "booked" | "unavailable" | "failed" | "no-answer";

export interface CallRecord {
  planId: string;
  callSid?: string;
  status: CallStatus;
  questions: { question: string; options: string[]; answer?: string; answeredBy?: string }[];
  result?: { status: string; time?: string; notes?: string };
}

export interface SplitLine {
  memberId: string;
  amount: number;
  confirmed: boolean;
  messageId?: string;
  transferId?: string;
  failed?: string;
}

export interface Split {
  planId?: string;
  chatId: string;
  payerId: string;
  total: number;
  lines: SplitLine[];
}
