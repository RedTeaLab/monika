"""AI-assisted character generator for CoC 7e."""

import json
import logging
import random
from typing import Optional
from pydantic import BaseModel

from src.services.llm.openai import OpenAIProvider

logger = logging.getLogger(__name__)


class CharacterGenerationRequest(BaseModel):
    """Request for AI character generation."""

    backstory: Optional[str] = None
    occupation: Optional[str] = None
    era: Optional[str] = "1920s"
    min_age: Optional[int] = 18
    max_age: Optional[int] = 60
    gender: Optional[str] = None
    additional_notes: Optional[str] = None


class GeneratedCharacter(BaseModel):
    """Generated character data."""

    name: str
    age: int
    gender: str
    occupation: str
    backstory: str

    str_stat: int
    con_stat: int
    dex_stat: int
    app_stat: int
    pow_stat: int
    int_stat: int
    siz_stat: int
    edu_stat: int

    hp: int
    mp: int
    san: int
    luck: int

    skills: dict
    interests: list
    languages: list

    personality_traits: list
    motivations: list


class CharacterGenerator:
    """Generate CoC 7e characters with AI assistance."""

    OCCUPATIONS = [
        "antiquarian",
        "artist",
        "athlete",
        "author",
        "clergy",
        "criminal",
        "detective",
        "doctor",
        "drifter",
        "engineer",
        "entertainer",
        "farmer",
        "hacker",
        "journalist",
        "lawyer",
        "librarian",
        "military_officer",
        "musician",
        "parapsychologist",
        "pilot",
        "police_officer",
        "private_investigator",
        "professor",
        "sailor",
        "scientist",
        "soldier",
        "student",
        "teacher",
    ]

    ERAS = ["classic", "modern", "gaslight", "down_dark_roads", "delta_green"]

    def __init__(self, llm_provider: Optional[OpenAIProvider] = None):
        self.llm = llm_provider

    def roll_3d6_times_5(self) -> int:
        """Roll 3d6 * 5 for characteristic."""
        return sum(random.randint(1, 6) for _ in range(3)) * 5

    def roll_2d6_plus_6_times_5(self) -> int:
        """Roll (2d6+6) * 5 for STR/CON/POW/DEX/APP."""
        return (sum(random.randint(1, 6) for _ in range(2)) + 6) * 5

    def roll_3d6_times_5_plus_5(self) -> int:
        """Roll (3d6+3) * 5 for INT/EDU."""
        return (sum(random.randint(1, 6) for _ in range(3)) + 3) * 5

    def generate_quick(self, occupation: Optional[str] = None) -> GeneratedCharacter:
        """Generate a quick random character without AI."""
        occupation = occupation or random.choice(self.OCCUPATIONS)

        str_stat = self.roll_2d6_plus_6_times_5()
        con_stat = self.roll_2d6_plus_6_times_5()
        dex_stat = self.roll_2d6_plus_6_times_5()
        app_stat = self.roll_2d6_plus_6_times_5()
        pow_stat = self.roll_2d6_plus_6_times_5()
        int_stat = self.roll_3d6_times_5_plus_5()
        siz_stat = self.roll_2d6_plus_6_times_5()
        edu_stat = self.roll_3d6_times_5_plus_5()

        hp = (con_stat + siz_stat) // 10
        mp = pow_stat // 5
        san = pow_stat
        luck = self.roll_3d6_times_5()

        gender = random.choice(["male", "female"])
        age = random.randint(20, 55)

        first_names_male = [
            "James",
            "William",
            "Robert",
            "Thomas",
            "Charles",
            "Edward",
            "Henry",
            "Arthur",
        ]
        first_names_female = [
            "Mary",
            "Elizabeth",
            "Margaret",
            "Dorothy",
            "Florence",
            "Eleanor",
            "Grace",
            "Clara",
        ]
        last_names = [
            "Anderson",
            "Thompson",
            "Harris",
            "Clark",
            "Wilson",
            "Davis",
            "Miller",
            "Moore",
        ]

        if gender == "male":
            name = f"{random.choice(first_names_male)} {random.choice(last_names)}"
        else:
            name = f"{random.choice(first_names_female)} {random.choice(last_names)}"

        skills = self._generate_skills_for_occupation(occupation, edu_stat)

        return GeneratedCharacter(
            name=name,
            age=age,
            gender=gender,
            occupation=occupation,
            backstory=f"一个经验丰富的{self._translate_occupation(occupation)}，在这个动荡的时代寻找着自己的道路。",
            str_stat=str_stat,
            con_stat=con_stat,
            dex_stat=dex_stat,
            app_stat=app_stat,
            pow_stat=pow_stat,
            int_stat=int_stat,
            siz_stat=siz_stat,
            edu_stat=edu_stat,
            hp=hp,
            mp=mp,
            san=san,
            luck=luck,
            skills=skills,
            interests=random.sample(["阅读", "音乐", "旅行", "收藏", "摄影", "体育"], 2),
            languages=["英语"]
            + (["拉丁语"] if occupation in ["antiquarian", "professor", "doctor"] else []),
            personality_traits=["谨慎", "好奇"] if random.random() > 0.5 else ["勇敢", "直接"],
            motivations=["寻找真相", "保护家人", "追求知识"][random.randint(0, 2) :],
        )

    async def generate_with_ai(
        self,
        request: CharacterGenerationRequest,
        llm_provider: Optional[OpenAIProvider] = None,
    ) -> GeneratedCharacter:
        """Generate character using AI based on backstory."""
        llm = llm_provider or self.llm
        if not llm:
            return self.generate_quick(request.occupation)

        quick_char = self.generate_quick(request.occupation)

        prompt = f"""你是一个克苏鲁的呼唤第7版角色生成助手。
根据以下信息生成一个详细的角色背景故事：

时代: {request.era or "1920s"}
职业: {request.occupation or quick_char.occupation}
年龄范围: {request.min_age}-{request.max_age}
性别: {request.gender or "随机"}
用户提供的背景提示: {request.backstory or "无"}

请以JSON格式返回角色信息，包含以下字段：
- name: 角色全名
- age: 年龄（在指定范围内）
- gender: 性别 (male/female)
- occupation: 职业英文
- backstory: 200-300字的背景故事
- personality_traits: 2-3个性格特点
- motivations: 1-2个行动动机
- interests: 2-3个兴趣爱好

只返回JSON，不要其他内容。"""

        try:
            messages = [{"role": "user", "content": prompt}]
            response = ""
            async for chunk in llm.stream_chat(
                messages, "你是一个克苏鲁角色生成助手，只返回JSON格式数据。"
            ):
                response += chunk

            response = response.strip()
            if response.startswith("```"):
                response = response.split("```")[1]
                if response.startswith("json"):
                    response = response[4:]

            ai_data = json.loads(response)

            quick_char.name = ai_data.get("name", quick_char.name)
            quick_char.age = ai_data.get("age", quick_char.age)
            quick_char.gender = ai_data.get("gender", quick_char.gender)
            quick_char.occupation = ai_data.get("occupation", quick_char.occupation)
            quick_char.backstory = ai_data.get("backstory", quick_char.backstory)
            quick_char.personality_traits = ai_data.get(
                "personality_traits", quick_char.personality_traits
            )
            quick_char.motivations = ai_data.get("motivations", quick_char.motivations)
            quick_char.interests = ai_data.get("interests", quick_char.interests)

        except Exception as e:
            logger.warning(f"AI generation failed, using fallback: {e}")

        return quick_char

    def _generate_skills_for_occupation(self, occupation: str, edu: int) -> dict:
        """Generate appropriate skills for occupation."""
        occupation_skills = {
            "antiquarian": ["历史", "图书馆", "艺术:绘画", "神秘学", "心理学"],
            "artist": ["艺术:绘画", "摄影", "心理学", "洞察力", "说服"],
            "athlete": ["闪避", "攀爬", "跳跃", "游泳", "格斗"],
            "author": ["艺术:写作", "历史", "图书馆", "心理学", "说服"],
            "detective": ["心理学", "聆听", "侦查", "法律", "说服"],
            "doctor": ["急救", "医学", "生物学", "心理学", "拉丁语"],
            "engineer": ["机械维修", "电气维修", "驾驶", "科学:物理", "数学"],
            "journalist": ["艺术:写作", "摄影", "图书馆", "心理学", "说服"],
            "lawyer": ["法律", "说服", "心理学", "会计", "速记"],
            "librarian": ["图书馆", "历史", "神秘学", "外语", "计算机"],
            "professor": ["图书馆", "外语", "科学", "心理学", "教学"],
            "soldier": ["射击", "格斗", "闪避", "机械维修", "急救"],
        }

        skills: dict = {}
        base_skills = occupation_skills.get(
            occupation, ["图书馆", "心理学", "聆听", "侦查", "说服"]
        )

        for skill in base_skills:
            skills[skill] = edu

        return skills

    def _translate_occupation(self, occupation: str) -> str:
        """Translate occupation to Chinese."""
        translations = {
            "antiquarian": "古董商",
            "artist": "艺术家",
            "athlete": "运动员",
            "author": "作家",
            "clergy": "神职人员",
            "criminal": "罪犯",
            "detective": "侦探",
            "doctor": "医生",
            "engineer": "工程师",
            "journalist": "记者",
            "lawyer": "律师",
            "librarian": "图书管理员",
            "professor": "教授",
            "soldier": "士兵",
        }
        return translations.get(occupation, occupation)
