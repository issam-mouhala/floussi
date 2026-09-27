'use client'

import {
  ShoppingCart, Home, CarFront, PlugZap, HeartPulse, GraduationCap, Coffee, Bike,
  UtensilsCrossed, ShoppingBag, PartyPopper, Repeat, Package, Wallet, Plane, Gift,
  Smartphone, Dumbbell, Baby, PawPrint, Sparkles, Laptop, Fuel,
  CarTaxiFront, TramFront, BusFront, Zap, Droplets, Wifi, Flame, Landmark, Tv,
  Pill, Stethoscope, Glasses, BookOpen, Croissant, CakeSlice, IceCreamBowl, CupSoda,
  Sandwich, Cookie, Popcorn, Pizza, Soup, Fish, Beef, Wheat, Milk, Egg, Apple,
  Shirt, Footprints, Volleyball, Gamepad2, Music, Headphones, Hotel, Cloud, Globe,
  Newspaper, Scissors, Printer, KeyRound, WashingMachine, Hammer, Paintbrush,
  Briefcase, Heart, type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  ShoppingCart, Home, CarFront, PlugZap, HeartPulse, GraduationCap, Coffee, Bike,
  UtensilsCrossed, ShoppingBag, PartyPopper, Repeat, Package, Wallet, Plane, Gift,
  Smartphone, Dumbbell, Baby, PawPrint, Sparkles, Laptop, Fuel,
  // precise per-expense icons (smart detection)
  CarTaxiFront, TramFront, BusFront, Zap, Droplets, Wifi, Flame, Landmark, Tv,
  Pill, Stethoscope, Glasses, BookOpen, Croissant, CakeSlice, IceCreamBowl, CupSoda,
  Sandwich, Cookie, Popcorn, Pizza, Soup, Fish, Beef, Wheat, Milk, Egg, Apple,
  Shirt, Footprints, Volleyball, Gamepad2, Music, Headphones, Hotel, Cloud, Globe,
  Newspaper, Scissors, Printer, KeyRound, WashingMachine, Hammer, Paintbrush,
  Briefcase, Heart,
}

export const ICON_NAMES = Object.keys(ICONS)

export function CatIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Wallet
  return <Icon className={className} aria-hidden />
}
