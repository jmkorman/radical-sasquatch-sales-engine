export type TabName = "Restaurants" | "Retail" | "Catering" | "Food Truck" | "Active Accounts";
export type TabSlug = "restaurants" | "retail" | "catering" | "food-truck" | "active-accounts";

export type StatusValue =
  // Current stages
  | "Identified"
  | "Reached Out"
  | "Connected"
  | "Sample Sent"
  | "Tasting Complete"
  | "Decision Pending"
  | "Backburner"
  | "Not a Fit"
  // Legacy stages (kept for backward compat with existing sheet data)
  | "Researched"
  | "Contacted"
  | "Following Up"
  | "Closed - Won"
  | "Not Interested"
  | "";

export interface BaseAccount {
  id: string;
  _rowIndex: number;
  _tab: TabName;
  _tabSlug: TabSlug;
  account: string;
  type: string;
  location: string;
  status: StatusValue;
  nextSteps: string;
  nextActionType: string; // structured action type: "follow-up-call", "send-sample", etc.
  contactDate: string; // "Contact" column = date of last contact
  contactName: string; // "Contact Name" / "Buyer" / "Client"
  phone: string;
  email: string;
  estMonthlyOrder: string;
  commissionPct: string;
  notes: string;
  ig: string;
  website: string;
}

export interface RestaurantAccount extends BaseAccount {
  _tab: "Restaurants";
  _tabSlug: "restaurants";
  kitchen: string;
  dumplings: string;
}

export interface RetailAccount extends BaseAccount {
  _tab: "Retail";
  _tabSlug: "retail";
}

export interface CateringAccount extends BaseAccount {
  _tab: "Catering";
  _tabSlug: "catering";
}

export interface FoodTruckAccount extends BaseAccount {
  _tab: "Food Truck";
  _tabSlug: "food-truck";
}

export interface ActiveAccount {
  id: string;
  _rowIndex: number;
  _tab: "Active Accounts";
  _tabSlug: "active-accounts";
  account: string;
  type: string;
  contactName: string;
  status: StatusValue;
  rsLead: string;
  contactDate: string;
  nextSteps: string;
  nextActionType: string;
  phone: string;
  email: string;
  order: string;
  notes: string;
}

export type AnyAccount =
  | RestaurantAccount
  | RetailAccount
  | CateringAccount
  | FoodTruckAccount
  | ActiveAccount;

export interface AllTabsData {
  restaurants: RestaurantAccount[];
  retail: RetailAccount[];
  catering: CateringAccount[];
  foodTruck: FoodTruckAccount[];
  activeAccounts: ActiveAccount[];
}
