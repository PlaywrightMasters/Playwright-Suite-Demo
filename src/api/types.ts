/**
 * The API contract as the tests expect it. Deliberately defined here rather than
 * imported from the app, so a server-side type change cannot silently "agree"
 * with the tests.
 */

export type Category = 'Electronics' | 'Furniture' | 'Office Supplies' | 'Apparel';
export type ProductStatus = 'active' | 'archived';
export type Currency = 'USD' | 'EUR' | 'INR';
export type Density = 'comfortable' | 'compact';
export type ActivityAction = 'create' | 'update' | 'delete' | 'status' | 'settings' | 'reset';

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: Category;
  price: number;
  quantity: number;
  status: ProductStatus;
  updatedAt: string;
}

export type ProductInput = Omit<Product, 'id' | 'updatedAt' | 'status'> & {
  status?: ProductStatus;
};

export interface LoginResponse {
  token: string;
  username: string;
  expiresAt: string;
}

export interface ApiErrorBody {
  error: string;
  details?: Record<string, string>;
}

export interface Summary {
  currency: Currency;
  lowStockThreshold: number;
  totalProducts: number;
  activeProducts: number;
  archivedProducts: number;
  totalUnits: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  byCategory: Array<{ category: Category; products: number; units: number; value: number }>;
}

export interface ActivityEntry {
  id: number;
  action: ActivityAction;
  message: string;
  actor: string;
  timestamp: string;
}

export interface Settings {
  lowStockThreshold: number;
  currency: Currency;
  density: Density;
  emailAlerts: boolean;
  dailyDigest: boolean;
  categoryOrder: Category[];
}

export interface ProductQuery {
  search?: string;
  category?: string;
  status?: 'all' | ProductStatus;
  sort?: string;
  order?: 'asc' | 'desc';
}
