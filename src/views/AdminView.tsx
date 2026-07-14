import { useState } from "react";
import { X, Check, ShieldCheck } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/Card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/Table";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { employees, type Employee } from "../lib/data";

interface ManagerUser {
  id: string;
  name: string;
  role: "manager" | string;
  status: "active" | "inactive";
  banned?: boolean;
}

const hoverScrollbarClasses = 
  "max-h-[400px] overflow-y-auto pr-2 " +
  "[scrollbar-width:thin] [scrollbar-color:transparent_transparent] hover:[scrollbar-color:#cbd5e1_transparent] " +
  "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-transparent " +
  "hover:[&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full transition-colors duration-300";

export function AdminView() {
  const [localEmployees, setLocalEmployees] = useState(() => employees.map((e) => ({ ...e, banned: false })) as (Employee & { banned?: boolean })[]);
  
  const [managers, setManagers] = useState<ManagerUser[]>([
    { id: "MAN-001", name: "Ramon Lopez", role: "manager", status: "active", banned: false },
    { id: "MAN-002", name: "Evelyn Cruz", role: "manager", status: "active", banned: false },
  ]);

  function toggleBanEmployee(id: string) {
    setLocalEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, banned: !(e as any).banned } : e)));
  }

  function toggleBanManager(id: string) {
    setManagers((prev) => prev.map((m) => (m.id === id ? { ...m, banned: !m.banned } : m)));
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 px-5 py-5 shadow-sm backdrop-blur">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-rose-500/10 via-transparent to-transparent" />
        <div className="relative flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Admin Control Panel</h2>
            <p className="text-sm text-slate-500">Manage user access, bans, and global system configuration</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Ban / Unban Employees Table */}
        <Card>
          <CardHeader>
            <CardTitle>Employee Access</CardTitle>
            <CardDescription>Ban or unban standard employee accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={hoverScrollbarClasses}>
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localEmployees.map((e) => (
                    <TableRow key={e.id} className="group hover:bg-slate-50/70">
                      <TableCell>
                        <div className="font-medium text-slate-900">{e.name}</div>
                        <div className="text-xs text-slate-500">{e.id}</div>
                      </TableCell>
                      <TableCell>
                        {(e as any).banned ? (
                          <Badge variant="danger">Banned</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant={(e as any).banned ? "outline" : undefined} onClick={() => toggleBanEmployee(e.id)}>
                          {(e as any).banned ? (
                            <><Check className="mr-1.5 h-3.5 w-3.5" />Unban</>
                          ) : (
                            <><X className="mr-1.5 h-3.5 w-3.5" />Ban</>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Ban / Unban Managers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Manager Access</CardTitle>
            <CardDescription>Ban or unban management accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={hoverScrollbarClasses}>
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                  <TableRow>
                    <TableHead>Manager</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {managers.map((m) => (
                    <TableRow key={m.id} className="group hover:bg-slate-50/70">
                      <TableCell>
                        <div className="font-medium text-slate-900">{m.name}</div>
                        <div className="text-xs text-slate-500">{m.id}</div>
                      </TableCell>
                      <TableCell>
                        {m.banned ? (
                          <Badge variant="danger">Banned</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant={m.banned ? "outline" : undefined} onClick={() => toggleBanManager(m.id)}>
                          {m.banned ? (
                            <><Check className="mr-1.5 h-3.5 w-3.5" />Unban</>
                          ) : (
                            <><X className="mr-1.5 h-3.5 w-3.5" />Ban</>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Global Settings Table */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-slate-700" />
              System Settings
            </CardTitle>
            <CardDescription>Global configuration and system restrictions</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Configuration</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium text-slate-900">Maintenance Mode</TableCell>
                  <TableCell className="text-slate-500 text-sm">Lock out all non-admin users instantly</TableCell>
                  <TableCell><Badge variant="neutral">Off</Badge></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline">Toggle</Button></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-slate-900">Automated Backups</TableCell>
                  <TableCell className="text-slate-500 text-sm">Daily database snapshots at 00:00 UTC</TableCell>
                  <TableCell><Badge variant="success">Active</Badge></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline">Configure</Button></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-slate-900">New User Registration</TableCell>
                  <TableCell className="text-slate-500 text-sm">Allow new employees to sign up</TableCell>
                  <TableCell><Badge variant="success">Open</Badge></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline">Restrict</Button></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}