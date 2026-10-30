import { NextRequest } from "next/server";
import {
  getMaintenanceResponse,
  updateMaintenanceResponse,
} from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export async function GET() {
  return getMaintenanceResponse();
}

export async function POST(request: NextRequest) {
  return updateMaintenanceResponse(request);
}

export async function PATCH(request: NextRequest) {
  return updateMaintenanceResponse(request);
}
