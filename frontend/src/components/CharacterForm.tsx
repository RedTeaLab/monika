import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Save, Upload, Download, User, Swords, BookOpen, Heart } from "lucide-react"
import { characterApi, CharacterCreate } from "@/lib/api"
import { toast } from "sonner"

// Skill presets from CoC 7e
const PRESET_SKILLS: Record<string, number> = {
  // Basic skills
  "Accounting": 10,
  "Anthropology": 1,
  "Appraise": 5,
  "Archaeology": 1,
  "Art/Craft": 5,
  "Charm": 15,
  "Climb": 20,
  "Credit Rating": 10,
  "Cthulhu Mythos": 0,
  "Disguise": 5,
  "Dodge": 0,
  "Drive Auto": 20,
  "Electric Repair": 10,
  "Fast Talk": 10,
  "Fighting": 25,
  "Firearms": 20,
  "First Aid": 30,
  "History": 5,
  "Intimidate": 15,
  "Jump": 20,
  "Law": 5,
  "Locale": 10,
  "Locksmith": 1,
  "Mechanical Repair": 10,
  "Medicine": 5,
  "Natural World": 10,
  "Navigate": 10,
  "Occult": 5,
  "Opinion": 10,
  "Persuade": 10,
  "Psychology": 10,
  "Ride": 5,
  "Science": 1,
  "Sleight of Hand": 10,
  "Spot Hidden": 25,
  "Stealth": 20,
  "Survival": 10,
  "Swim": 20,
  "Throw": 20,
  "Track": 10,
}

export interface CharacterData {
  // Basic info
  name: string
  occupation: string
  age: number
  residence: string
  background: string

  // Attributes
  str: number
  con: number
  dex: number
  app: number
  pow: number
  int: number
  siz: number
  edu: number

  // Derived stats (calculated)
  hp: number
  mp: number
  san: number
  luck: number
  move: number
  build: number
  dodge?: number
  skills?: Record<string, number>
}

interface CharacterFormProps {
  initialData?: Partial<CharacterData>
  characterId?: number
  onSave?: (character: CharacterData) => void
  onCancel?: () => void
  isLoading?: boolean
}

const emptyCharacter: CharacterData = {
  name: "",
  occupation: "",
  age: 20,
  residence: "",
  background: "",
  str: 50,
  con: 50,
  dex: 50,
  app: 50,
  pow: 50,
  int: 50,
  siz: 50,
  edu: 50,
  hp: 10,
  mp: 10,
  san: 50,
  luck: 50,
  move: 8,
  build: 0,
}

export function CharacterForm({ initialData, characterId, onSave, onCancel, isLoading }: CharacterFormProps) {
  const [formData, setFormData] = useState<CharacterData>({
    ...emptyCharacter,
    ...initialData,
  })
  const [skills, setSkills] = useState<Record<string, number>>(PRESET_SKILLS)
  const [activeTab, setActiveTab] = useState("basic")

  // Calculate derived stats
  useEffect(() => {
    const hp = Math.floor((formData.con + formData.siz) / 10)
    const mp = Math.floor(formData.pow / 5)
    const san = formData.pow
    const luck = formData.pow
    const move = formData.dex >= formData.siz && formData.str >= formData.siz ? 9 : 8
    const build =
      formData.str + formData.siz >= 165 ? 2 : formData.str + formData.siz >= 125 ? 1 : 0
    const dodge = formData.dex / 2

    setFormData((prev) => ({
      ...prev,
      hp,
      mp,
      san,
      luck,
      move,
      build,
      dodge: Math.floor(dodge),
    }))
  }, [formData.str, formData.con, formData.dex, formData.siz, formData.pow])

  const handleInputChange = (field: keyof CharacterData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSkillChange = (skill: string, value: number) => {
    setSkills((prev) => ({ ...prev, [skill]: value }))
  }

  const handleSave = async () => {
    try {
      const characterData = { ...formData, skills }

      // Map form data to API format
      const apiData: CharacterCreate = {
        name: formData.name,
        age: formData.age,
        gender: "other", // Default value, can be added to form later
        occupation: formData.occupation,
        mental_illness: "",
        backstory: formData.background,
        str: formData.str,
        con: formData.con,
        dex: formData.dex,
        app: formData.app,
        pow: formData.pow,
        intelligence: formData.int,
        siz: formData.siz,
        edu: formData.edu,
        luck: formData.luck,
      }

      if (characterId) {
        // Update existing character
        await characterApi.update(characterId, apiData)
        toast.success("Character updated successfully")
      } else {
        // Create new character
        await characterApi.create(apiData)
        toast.success("Character created successfully")
      }

      // Call parent callback if provided
      if (onSave) {
        onSave(characterData)
      }
    } catch (error) {
      console.error("Failed to save character:", error)
      toast.error(characterId ? "Failed to update character" : "Failed to create character")
    }
  }

  const handleExport = () => {
    const data = { ...formData, skills }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${formData.name || "character"}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        setFormData(data)
        if (data.skills) {
          setSkills(data.skills)
        }
      } catch (error) {
        console.error("Failed to import character:", error)
      }
    }
    reader.readAsText(file)
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {initialData?.name ? "Edit Character" : "Create Character"}
          </CardTitle>
          <div className="flex gap-2">
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
              id="import-character"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById("import-character")?.click()}
            >
              <Upload className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="attributes">Attributes</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="derived">Derived</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Character name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occupation">Occupation</Label>
                <Input
                  id="occupation"
                  value={formData.occupation}
                  onChange={(e) => handleInputChange("occupation", e.target.value)}
                  placeholder="e.g. Private Investigator"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  min={15}
                  max={90}
                  value={formData.age}
                  onChange={(e) => handleInputChange("age", parseInt(e.target.value) || 20)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="residence">Residence</Label>
                <Input
                  id="residence"
                  value={formData.residence}
                  onChange={(e) => handleInputChange("residence", e.target.value)}
                  placeholder="e.g. Boston, MA"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="background">Background</Label>
              <Textarea
                id="background"
                value={formData.background}
                onChange={(e) => handleInputChange("background", e.target.value)}
                placeholder="Character backstory..."
                rows={4}
              />
            </div>
          </TabsContent>

          {/* Attributes Tab */}
          <TabsContent value="attributes">
            <div className="grid grid-cols-4 gap-4">
              {[
                { key: "str", label: "STR", desc: "Strength" },
                { key: "con", label: "CON", desc: "Constitution" },
                { key: "dex", label: "DEX", desc: "Dexterity" },
                { key: "app", label: "APP", desc: "Appearance" },
                { key: "pow", label: "POW", desc: "Power" },
                { key: "int", label: "INT", desc: "Intelligence" },
                { key: "siz", label: "SIZ", desc: "Size" },
                { key: "edu", label: "EDU", desc: "Education" },
              ].map((attr) => (
                <div key={attr.key} className="space-y-2">
                  <Label htmlFor={attr.key} className="text-xs">
                    {attr.label}
                  </Label>
                  <Input
                    id={attr.key}
                    type="number"
                    min={0}
                    max={100}
                    value={formData[attr.key as keyof CharacterData] as number}
                    onChange={(e) =>
                      handleInputChange(attr.key as keyof CharacterData, parseInt(e.target.value) || 50)
                    }
                  />
                  <p className="text-xs text-muted-foreground">{attr.desc}</p>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Skills Tab */}
          <TabsContent value="skills">
            <ScrollArea className="h-96">
              <div className="grid grid-cols-3 gap-3 pr-4">
                {Object.entries(PRESET_SKILLS).map(([skill, defaultValue]) => (
                  <div key={skill} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`skill-${skill}`} className="text-xs">
                        {skill}
                      </Label>
                      <Badge variant="outline" className="text-xs">
                        {defaultValue}%
                      </Badge>
                    </div>
                    <Input
                      id={`skill-${skill}`}
                      type="number"
                      min={0}
                      max={100}
                      value={skills[skill] || defaultValue}
                      onChange={(e) => handleSkillChange(skill, parseInt(e.target.value) || defaultValue)}
                      className="h-8"
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Derived Stats Tab */}
          <TabsContent value="derived">
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "hp", label: "Hit Points", icon: Heart, color: "text-red-500" },
                { key: "mp", label: "Magic Points", icon: BookOpen, color: "text-blue-500" },
                { key: "san", label: "Sanity", icon: Swords, color: "text-yellow-500" },
                { key: "luck", label: "Luck", icon: "🍀", color: "text-green-500" },
                { key: "move", label: "Move Rate", icon: "🏃", color: "text-gray-500" },
                { key: "build", label: "Build", icon: "💪", color: "text-purple-500" },
              ].map((stat) => (
                <Card key={stat.key}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <stat.icon className={`h-5 w-5 ${stat.color}`} />
                        <span className="font-medium">{stat.label}</span>
                      </div>
                      <Badge variant="secondary" className="text-lg font-bold">
                        {formData[stat.key as keyof CharacterData] as number}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> Derived stats are automatically calculated based on your
                attributes. Hover over each stat to see the formula used.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={isLoading || !formData.name}>
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? "Saving..." : initialData?.name ? "Update" : "Create"} Character
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
