import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">FraudCast</CardTitle>
          <CardDescription>
            Next.js App Router with Tailwind CSS and shadcn/ui.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Edit <code className="font-mono text-foreground">app/page.tsx</code> to
          get started. Add more components with{" "}
          <code className="font-mono text-foreground whitespace-nowrap">
            npx shadcn@latest add
          </code>
          .
        </CardContent>
        <CardFooter className="gap-2">
          <Button>Get started</Button>
          <Button variant="outline" nativeButton={false} render={<a href="https://ui.shadcn.com" />}>
            shadcn/ui docs
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
